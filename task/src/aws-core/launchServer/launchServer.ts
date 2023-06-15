import { $, execa } from "execa";
import { existsSync } from "fs";
import { env } from "../utils/env.js";
import { Instance } from "../instance/index.js";
import { polling, sleep } from "../instance/utils.js";
import { IGitConfig } from "../interface/IGitConfig.js";

const tl = {
  getVariable: (name: string) => name,
};

const DEFAULT_SERVER_APP_PATH = "/etc/prbranch/app";
export class LunchServer {
  instance: Instance;
  private readonly tarballFilePath: string;

  constructor(ec2: Instance, private config: IGitConfig) {
    this.instance = ec2;
    this.tarballFilePath = `${config.buildDirectory}/app.tar.gz`;
  }

  async run(cloneLink: string) {
    try {
      const dockerfilePaths = cloneLink;
      const git = this.getGitUrl(dockerfilePaths, this.config.sourceBranch);
      if (!this.config.clonePath) throw new Error("Clone Path not found");

      await this.cloneRepo({ ...git, clonePath: this.config.clonePath });
      await this.compressRepo(this.config.clonePath);

      if (!env.securityGroup || !env.securityId || !env.keyName)
        throw new Error(
          "Can not launch instance without security group, and keyName"
        );

      // launch instance
      await this.instance.launch({
        name: `${this.config.prId}-${git.branch}`,
        keyName: env.keyName,
      });

      await sleep(10);

      try {
        await this.instance
          .waitUntilInstance()
          .then(async () => {
            //instance after starting tasks some time to start sshd
            await sleep(10);
            await polling({
              maxRetries: 3,
              cb: () => this.instance.verifySshConnection(),
            });
            console.log("\n SSH connection established 🎉 \n");
          })
          .catch((e) => {
            throw new Error("SSH connection failed aborting... ");
          });

        // already running instance should, start from snap shot instance
        // await this.instance.cleanDockerImgs();

        await sleep(5);
        await this.instance.cpyTarOnInstance(
          this.tarballFilePath,
          DEFAULT_SERVER_APP_PATH
        );

        await this.instance.mvStartScriptToServer();
      } catch (error) {
        console.error(error);
        throw Error("Docker image creation failed aborting...", {
          cause: error,
        });
      }
    } catch (error) {
      throw error;
    }
  }

  private async cloneRepo(git: {
    url: string;
    branch: string;
    clonePath: string;
  }) {
    // await this.removeTempAppDir();
    try {
      console.log("cloning new dir");
      const repo = await execa(
        "git",
        [
          "clone",
          git.url,
          "--depth=1",
          `--branch=${git.branch}`,
          git.clonePath,
        ],
        { verbose: true }
      );
      return repo;
    } catch (error) {
      throw new Error("Can not clone error", { cause: error });
    }
  }

  private async compressRepo(repoPath: string) {
    console.log("Compressing new dir");

    console.log("cmd running");
    console.log(
      `tar ${[
        "cfz",
        `${this.tarballFilePath}`,
        "--exclude",
        ".git",
        "-C",
        repoPath,
        ".",
      ].join(" ")} `
    );

    await execa("tar", [
      "cfz",
      `${this.tarballFilePath}`,
      "--exclude",
      ".git",
      "-C",
      repoPath,
      ".",
    ])
      .then(() => console.log("compress and saved file"))
      .catch((e) => {
        throw new Error("File compress failed", { cause: e });
      });
  }

  private async removeTempAppDir(tempDir: string) {
    if (existsSync(tempDir)) {
      await execa("rm", ["-rf", tempDir])
        .then(() => {
          console.log(`${tempDir} removed`);
        })
        .catch(() => {
          throw new Error("Failed to remove dir");
        });
    } else {
      console.log("temp not found");
    }
  }

  private getGitUrl(appPath: string, sourceBranch = "develop") {
    const hasHttpRegEx = /^https?/;

    if (!hasHttpRegEx.test(appPath))
      throw new Error("APP_PATH should be git clone path");

    const [gitUrl] = appPath.split("#", 2);

    return { url: gitUrl, branch: sourceBranch?.replace?.("refs/heads/", "") };
  }
}
