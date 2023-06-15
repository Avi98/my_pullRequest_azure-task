import { EC2Client, InstanceStateName, Reservation } from "@aws-sdk/client-ec2";
import { $, execa } from "execa";
import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { InstanceCmdFactories } from "./instanceFactories.js";
import { createPrivateKeyFile, polling } from "./utils.js";
import { fileURLToPath } from "url";
import { env } from "../index.js";

type InstanceConfigType = {
  sshPrivateKey: string;
  identityFilePath: string;
  //instance
  region: string;
  imageId: string;
  imageType: string;
  securityGroupId: string;
  securityGroupName: string;
};

type LaunchInstanceConfig = {
  name: string;
  keyName: string;
};

type InitializeInstance = {
  name: string | null;
  awsUrl: string | null;
  id: string | null;
  ip: string | null;
};
interface IInstance {
  launch: (config: LaunchInstanceConfig) => void;
}

export class Instance implements IInstance {
  private client: EC2Client;
  private launchedInstanceId: string | null;
  private instanceName: string | null;
  private semaphore: string;
  private privateFile: string;
  private publicDns: string | null;
  private liveUrl: string | null;
  private instanceRegion: string;
  private cmd: typeof InstanceCmdFactories;
  private imageId: string;
  private imageType: string;
  private securityGroupId: string;
  private securityGroupName: string;

  private static RUNNING_INSTANCE_CODE = "16";

  constructor({
    region,
    identityFilePath,
    sshPrivateKey,
    imageId,
    imageType,
    securityGroupId,
    securityGroupName,
  }: InstanceConfigType) {
    this.cmd = InstanceCmdFactories;

    this.imageId = imageId;
    this.imageType = imageType;
    this.securityGroupId = securityGroupId;
    this.securityGroupName = securityGroupName;
    this.instanceRegion = region;
    this.semaphore = "/etc/prbranch/ready";
    this.launchedInstanceId = null;
    this.instanceName = null;
    this.publicDns = null;
    this.liveUrl = null;
    this.privateFile = createPrivateKeyFile(
      sshPrivateKey,
      `${identityFilePath}`,
      "private.key"
    );
    this.client = InstanceCmdFactories.createInstance({
      region,
    });
  }

  private getInstance = (instances: Required<Reservation["Instances"]>) =>
    instances
      ? (instances
          .map((instance) =>
            Boolean(instance?.Tags?.length)
              ? { name: instance.Tags!.at(0)?.Value!, id: instance.InstanceId! }
              : null
          )
          .filter(Boolean) as { name: string; id: string }[])
      : null;

  async getAllRunningInstance() {
    const runningInstanceCmd = {
      Filters: [
        {
          Name: "image-id",
          Values: [this.imageId],
        },
        {
          Name: "instance-type",
          Values: [this.imageType],
        },
        {
          Name: "instance-state-code",
          Values: [Instance.RUNNING_INSTANCE_CODE],
        },
      ],
    };

    try {
      return await this.client
        .send(this.cmd.describeInstance(runningInstanceCmd))
        .then((instanceRes) => {
          const instance = instanceRes.Reservations?.map((res) =>
            res.Instances ? this.getInstance(res.Instances) : null
          )
            .flat()
            .filter(Boolean);
          if (!instance?.length) null;
          return instance! as { name: string; id: string }[];
        })
        .catch((e) => {
          if (env.isDev) {
            throw e;
          }
          return [];
        });
    } catch (error) {
      throw new Error("No instance found");
    }
  }

  /**
   * checks if the instance already exsits.
   * if not exits create new instance should be created
   *
   * @TODO ami_id gets changed frequently need to find dynamic ami-id.
   * @param instanceConfig
   */
  async launch(instanceConfig: LaunchInstanceConfig) {
    const { name, keyName } = instanceConfig;
    try {
      const hasInstance = await this.hasDuplicateInstance(name);
      if (hasInstance) {
        //@TODO: clean previous running docker images
        console.log("Instance already running for this PR 🏃");

        //stop already running docker container
        await this.stopDockerContainer();
      } else {
        console.log("No running instance found, creating new instance");
        const userData = [
          `#!/bin/bash
        yum install -y docker`,
          "usermod -aG docker ec2-user",
          "service docker start",
          "echo 'docker image prune -a --filter=\"until=96h\" --force' > /etc/cron.daily/docker-prune && chmod a+x /etc/cron.daily/docker-prune",
          "mkdir -p /etc/prbranch/app && touch /etc/prbranch/ready && chown -R ec2-user:ec2-user /etc/prbranch",
        ].join(" && ");

        const bufferString = Buffer.from(userData).toString("base64");

        await this.client
          .send(
            //imageid changes frequently need to have dynamic image id
            this.cmd.runInstance({
              MaxCount: 1,
              MinCount: 1,
              UserData: bufferString,
              ImageId: this.imageId,
              InstanceType: this.imageType,
              SecurityGroupIds: [this.securityGroupId],
              SecurityGroups: [this.securityGroupName],
              KeyName: keyName,
              TagSpecifications: [
                {
                  ResourceType: "instance",
                  Tags: [
                    {
                      Key: "Name",
                      Value: name,
                    },
                  ],
                },
              ],
            })
          )
          .then((instance) => {
            console.log(
              `instance launched with id ${
                instance.Instances?.at(0)?.InstanceId
              }`
            );

            const launchedInstance = instance.Instances?.at(0) || null;
            console.log(
              `instance state ${launchedInstance?.State?.Name} for InstanceName: ${name}, publicIp: ${launchedInstance?.PublicIpAddress} `
            );
            this.updateInstanceState({
              awsUrl: launchedInstance?.PublicDnsName || null,
              id: launchedInstance?.InstanceId || null,
              name: instanceConfig.name || null,
              ip: launchedInstance?.PublicIpAddress || null,
            });

            return instance.Instances?.at(0)?.InstanceId;
          })
          .catch((e) => {
            throw e;
          });
      }
    } catch (error) {
      throw new Error(`${instanceConfig.name} lunch error`, { cause: error });
    }
  }

  async deleteInstance(instanceId: string | string[]) {
    if (!instanceId) throw new Error("Delete instance requires instance Id");

    const ids = Array.isArray(instanceId) ? instanceId : [instanceId];
    try {
      return await this.client.send(
        InstanceCmdFactories.deleteInstance({
          InstanceIds: ids,
        })
      );
    } catch (error) {
      throw new Error("Unable to delete instance", { cause: error });
    }
  }

  // stop docker
  private async stopDockerContainer() {
    const runningContainerId = await this.isDockerContainerRunning();

    //clean all already running container
    if (runningContainerId) {
      await this.ssh(`docker stop ${runningContainerId}`);
      await this.ssh(`docker rm ${runningContainerId}`);
      //node thinks one backslash as escape
      await this.ssh(`docker rmi \\$(docker images -q)`);
    }
  }

  private async isDockerContainerRunning() {
    try {
      const container = await this.ssh(`docker ps -aq`);
      return Boolean(container.stdout);
    } catch (error) {
      return false;
    }
  }

  async waitUntilInstance() {
    const instanceName = this.instanceName;
    if (
      instanceName &&
      (await polling({
        cb: async () => await this.hasDuplicateInstance(instanceName),
      }))
    ) {
      return true;
    } else if (!instanceName) {
      throw new Error("Instance Name not found");
    }
    throw new Error("Instance timeout aborting instance creation");
  }

  verifySshConnection = async () => {
    let sshConnected = false;
    await this.ssh(`test -f ${this.semaphore}`)
      .then(() => {
        return (sshConnected = true);
      })
      .catch(() => {
        sshConnected = false;
      });
    return sshConnected;
  };

  async cpyTarOnInstance(sourcePath: string, serverAppPath: string) {
    //scp tmp files to /tmp/app

    if (!sourcePath && !serverAppPath)
      throw new Error("Source or Server path for app not provided");

    try {
      console.log("cpy....");
      await this.scp({
        source: sourcePath,
        target: serverAppPath,
      });
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  async mvStartScriptToServer() {
    try {
      const startScript = this.getStartUpScript();
      console.log({ startScript });

      if (!existsSync(startScript))
        throw new Error("Docker Start script not found");
      await this.scp({ source: startScript, target: "/etc/prbranch" });
      //@TODO change the dockerimage tag based on the pullRequest and commit sha
      await this.ssh(`cd /etc/prbranch && sh upload.sh -a /app -g pullpreview`);
    } catch (error) {
      throw new Error("Failed to cpy startUp script to instance", {
        cause: error,
      });
    }
  }

  private getStartUpScript() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    return resolve(__dirname, "../../../../core/upload.sh");
  }

  get liveInstUrl() {
    return this.liveUrl;
  }

  private async scp({ source, target }: { source: string; target: string }) {
    const host = this.publicDns;
    const remoteUser = "ec2-user";
    const tempPrivateKey = this.privateFile;

    console.log("Starting to cpy files to server 📁 ---> 📂");

    await execa(
      "scp",
      [
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "-o",
        "ServerAliveInterval=15",
        "-o",
        "LogLevel=ERROR",
        "-r",
        `-i`,
        `${tempPrivateKey}`,
        `${source}`,
        `${remoteUser}@${host}:${target}`,
      ],
      {
        env: {
          ...process.env,
          NODE_DEBUG: "child_process",
        },
        verbose: true,
        shell: true,
      }
    )
      .then((res) => {
        if (res.exitCode === 0) console.log("done writing the files ✅");
      })
      .catch((e) => {
        throw e;
      });
  }

  private async ssh(cmd: string, debug = false) {
    const publicDns = this.publicDns;
    const sshHostAddress = `ec2-user@${publicDns}`;
    const tempPrivateKey = this.privateFile;

    const sshDefaultOptions = [
      "-o StrictHostKeyChecking=no",
      "-o ServerAliveInterval=15",
      "-o UserKnownHostsFile=/dev/null",
      "-o LogLevel=ERROR",
      "-o ConnectTimeout=10",
    ];

    debug ? sshDefaultOptions.push("-vvv") : "";

    const cmdToRun = `ssh ${sshDefaultOptions.join(
      " "
    )} -i "${tempPrivateKey}" "${sshHostAddress}" "${cmd}"`;

    console.log("\n----\n");
    console.log(`\n running cmd..\n`, cmdToRun);
    console.log("\n----\n");

    return await $({ verbose: true, shell: true })`${cmdToRun}`
      .then((res) => {
        console.log(`\n successfully ran this cmd ${cmdToRun} \n`);
        return res;
      })
      .catch((e) => {
        console.error(e);
        throw new Error("Error while logging the cmd", { cause: e });
      });
  }

  private updateInstanceState(currentInstance: InitializeInstance) {
    this.instanceName = currentInstance.name;
    this.launchedInstanceId = currentInstance.id;
    this.publicDns = currentInstance.awsUrl;
    //change this once the dns is setup
    this.liveUrl = `http://${currentInstance.ip}:3000`;
  }

  hasDuplicateInstance = async (name: string) => {
    let liveInstance = [];
    const instanceId = this.launchedInstanceId;
    try {
      await this.getInstanceInfo({ id: instanceId || undefined, name })
        .then((res) => {
          console.log("Get instance");
          res?.forEach((inst) => {
            const instanceNameTag = inst?.Tags?.filter(
              (tag) => tag.Value === name
            )[0];

            //dns gets assigned only when the instance is live, so need to make sure instance is live
            if (
              inst?.PublicDnsName &&
              inst.InstanceId &&
              instanceNameTag?.Value
            ) {
              console.log(
                `instance state ${inst?.State?.Name} for InstanceName: ${instanceNameTag?.Value} `
              );
              liveInstance.push(inst);
              this.updateInstanceState({
                awsUrl: inst.PublicDnsName,
                id: inst.InstanceId,
                name: name,
                ip: inst.PublicIpAddress || null,
              });
            }
          });
        })
        .catch((e) => {
          console.error(e);
          throw e;
        });
    } catch (error) {}
    return Boolean(liveInstance.length);
  };

  async getInstanceInfo(queryInstance: { id?: string; name: string }) {
    const ids = queryInstance.id ? [queryInstance.id] : undefined;
    try {
      const res = await this.client.send(
        this.cmd.describeInstance({
          InstanceIds: ids,
          Filters: [
            {
              Name: "tag:Name",
              Values: [queryInstance.name],
            },
            {
              Name: "instance-state-name",
              Values: [InstanceStateName.running],
            },
          ],
        })
      );
      return res.Reservations?.flatMap((reservation) => reservation.Instances);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}
