import { Instance } from "@pr/aws-core";
import { ApiClient } from "../api/index.js";
import { PullRequestStatus } from "azure-devops-node-api/interfaces/GitInterfaces.js";

export class CleanUpLoseInstance {
  private static DEAD_PULL_REQUEST_STATUS = [
    PullRequestStatus.Abandoned,
    PullRequestStatus.Completed,
  ];
  constructor(private instance: Instance) {}

  private getPullReqId(instanceNames: string[]) {
    return instanceNames
      .map((names) => names.split("-").at(0))
      .filter(Number)
      .filter(Boolean) as string[];
  }

  private async checkStatusForPR(id: string) {
    const apiClient = await ApiClient.initializeApi();
    return await apiClient.getPRById(id);
  }

  private async fetchDeadPrs(prIds: string[]) {
    return Promise.all(prIds.map(this.checkStatusForPR)).then((prs) =>
      prs.filter(
        (pr) =>
          pr.status &&
          CleanUpLoseInstance.DEAD_PULL_REQUEST_STATUS.includes(pr.status)
      )
    );
  }

  private getDeadInstanceIds(allInstances: string[], deadPrsId?: number) {
    if (deadPrsId)
      return allInstances.filter((instance) =>
        instance.includes(String(deadPrsId))
      );
  }

  async run() {
    try {
      const allPrInstances = await this.instance.getAllRunningInstance();
      const allInstancesName = allPrInstances?.map(
        (prInstance) => prInstance.name
      );
      const deadPrs = await this.fetchDeadPrs(
        this.getPullReqId(allInstancesName)
      );
      const instanceIds = deadPrs
        .map((pr) =>
          this.getDeadInstanceIds(allInstancesName, pr.pullRequestId)
        )
        .flat()
        .filter(Boolean) as string[];

      await this.instance.deleteInstance(
        allPrInstances.map((prInstance) => prInstance.id)
      );
    } catch (error) {}
  }
}
