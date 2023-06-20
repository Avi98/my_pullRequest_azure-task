import { TaskResult, setResult } from "azure-pipelines-task-lib";
import { TriggerHandle } from "./triggerHandle.js";
import { CleanUpLoseInstance } from "./cleanup/index.js";
import { buildContext } from "./buildContext.js";
import { Instance, LunchServer, env } from "./aws-core/index.js";
import dotenv from "dotenv";
dotenv.config();

const main = async () => {
  try {
    const trigger = await TriggerHandle.create();
    const hasLabel = await trigger.hasTriggerLabel();
    const shouldCleanUp = (await trigger.isPRMerged()) || !hasLabel;

    //return trigger for clean up
    if (shouldCleanUp) return trigger;
    if (!hasLabel) return trigger;

    console.log(
      `Found ${TriggerHandle.TRIGGER_LABEL} creating the updated PR preview link 🚀 `
    );
    await trigger.createLivePR();

    return trigger;
  } catch (error: any) {
    console.error(error);
    throw error;
  }
};

const run = async () => {
  if (env.isDev && env.git?.remote_url) {
    const ec2 = new Instance({
      identityFilePath: buildContext.defaultPrivatePath,
      sshPrivateKey: env.sshKeys.privateKey,
      securityGroupId: env.securityId,
      securityGroupName: env.securityGroup,
      imageId: env.imageId || "ami-02f3f602d23f1659d",
      imageType: env.imageType || "t2.micro",
      region: env?.region || "us-east-1",
    });
    const ec2Starter = new LunchServer(ec2, buildContext);
    await ec2Starter.run(env.git.remote_url).catch((e) => {
      console.error(e);
    });

    const cleanUp = new CleanUpLoseInstance(ec2);
    await cleanUp.run();
  } else {
    main()
      .then((trigger) => {
        //clean ups
        console.log(
          `No ${TriggerHandle.TRIGGER_LABEL} found cleaning up instance if any 🗑️`
        );
        trigger?.cleanUpLoseInstance();
      })
      .catch((e) => {
        setResult(TaskResult.Failed, e.message);
      });
  }
};

run();
