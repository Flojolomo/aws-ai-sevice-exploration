import { IResource, Names, ResourceEnvironment, Stack } from "aws-cdk-lib";
import {
  AddToResourcePolicyResult,
  IResourceWithPolicy,
  PolicyStatement,
} from "aws-cdk-lib/aws-iam";
import * as osServerless from "aws-cdk-lib/aws-opensearchserverless";
import { Construct } from "constructs";

type DataAccessPolicyStatement = {
  Rules: {
    Resource: string[];
    Permission: string[];
    ResourceType: string;
  }[];
  Principal: string[];
  Description?: string;
};

interface OpenSearchDataAccessPolicyProps {
  collection: osServerless.CfnCollection;
}

export class OpenSearchDataAccessPolicy
  extends osServerless.CfnAccessPolicy
  implements IResource, IResourceWithPolicy
{
  public readonly env: ResourceEnvironment;

  private readonly dataAccessPolicyDocument: Array<DataAccessPolicyStatement> =
    [];

  private readonly collection: osServerless.CfnCollection;

  public constructor(
    scope: Construct,
    id: string,
    props: OpenSearchDataAccessPolicyProps
  ) {
    super(scope, id, {
      name: Names.uniqueResourceName(scope, {}),
      type: "data",
      policy: JSON.stringify([]),
    });

    const { account, region } = Stack.of(this);
    this.env = {
      account,
      region,
    };

    this.collection = props.collection;
  }

  addToResourcePolicy(statement: PolicyStatement): AddToResourcePolicyResult {
    // TODO validation
    throw new Error("Method not implemented.");
  }

  // public grantRead(grantee: string): void {
  //   this.dataAccessPolicyDocument.push({
  //     Rules: [
  //       {
  //         Resource: [`collection/${this.collection.name}`],
  //         Permission: ["aoss:DescribeCollectionItems"],
  //         ResourceType: "collection",
  //       },
  //       {
  //         Resource: [`index/${this.collection.name}/*`],
  //         Permission: ["aoss:DescribeIndex", "aoss:ReadDocument"],
  //         ResourceType: "index",
  //       },
  //     ],
  //     Principal: [role.roleArn],
  //   });

  //   this.dataAccessPolicy.policy = JSON.stringify(
  //     this.dataAccessPolicyDocument
  //   );
  // }
}
