/**
 * copied from the GitInterfaces.d.ts from
 * State of the status.
 */
export enum PullRequestStatusEnum {
  /**
   * Status state not set. Default state.
   */
  NotSet = 0,
  /**
   * Status pending.
   */
  Pending = 1,
  /**
   * Status succeeded.
   */
  Succeeded = 2,
  /**
   * Status failed.
   */
  Failed = 3,
  /**
   * Status with an error.
   */
  Error = 4,
  /**
   * Status is not applicable to the target object.
   */
  NotApplicable = 5,
}
