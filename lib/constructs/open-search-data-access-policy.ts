import { IResource, ResourceEnvironment, Stack } from "aws-cdk-lib";
import {
  AddToResourcePolicyResult,
  IResourceWithPolicy,
  PolicyStatement,
} from "aws-cdk-lib/aws-iam";
import * as osServerless from "aws-cdk-lib/aws-opensearchserverless";
import { Construct } from "constructs";

export class OpenSearchDataAccessPolicy
  extends osServerless.CfnAccessPolicy
  implements IResource, IResourceWithPolicy
{
  public readonly env: ResourceEnvironment;

  public constructor(
    scope: Construct,
    id: string,
    props: osServerless.CfnAccessPolicyProps
  ) {
    super(scope, id, props);

    const { account, region } = Stack.of(this);
    this.env = {
      account,
      region,
    };
  }

  addToResourcePolicy(statement: PolicyStatement): AddToResourcePolicyResult {
    throw new Error("Method not implemented.");
  }
}
