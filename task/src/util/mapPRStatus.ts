import { PullRequestStatusEnum } from "../enum/PullRequestStatusEnum.js";

export const mapPrStatusToText = {
  [PullRequestStatusEnum.Error]: "Error",
  [PullRequestStatusEnum.Failed]: "Failed",
  [PullRequestStatusEnum.NotApplicable]: "NotApplicable",
  [PullRequestStatusEnum.NotSet]: "NotSet",
  [PullRequestStatusEnum.Succeeded]: "Succeeded",
  [PullRequestStatusEnum.Pending]: "Pending",
};
