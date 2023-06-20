import {
  DescribeRegionsCommandInput,
  RunInstancesCommand,
  DescribeInstancesCommand,
  RunInstancesCommandInput,
  DescribeInstancesCommandInput,
  DescribeRegionsCommand,
  DescribeImagesCommandInput,
  DescribeImagesCommand,
  EC2,
  EC2ClientConfig,
  DescribeInstanceStatusCommandInput,
  DescribeInstanceStatusCommand,
  DescribeSnapshotsCommand,
  DescribeSnapshotsCommandInput,
  TerminateInstancesCommand,
  TerminateInstancesCommandInput,
} from "@aws-sdk/client-ec2";

export class InstanceCmdFactories {
  static createInstance(input: EC2ClientConfig) {
    return new EC2(input);
  }
  static runInstance(input: RunInstancesCommandInput) {
    return new RunInstancesCommand(input);
  }

  static describeInstance(input: DescribeInstancesCommandInput) {
    return new DescribeInstancesCommand(input);
  }
  static getInstanceStatus(input: DescribeInstanceStatusCommandInput) {
    return new DescribeInstanceStatusCommand(input);
  }

  static getRegions(input: DescribeRegionsCommandInput) {
    return new DescribeRegionsCommand(input);
  }

  static getImages(input: DescribeImagesCommandInput) {
    return new DescribeImagesCommand(input);
  }
  static getSnapShot(input: DescribeSnapshotsCommandInput) {
    return new DescribeSnapshotsCommand(input);
  }
  static deleteInstance(input: TerminateInstancesCommandInput) {
    return new TerminateInstancesCommand(input);
  }
}
