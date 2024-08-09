import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
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
  implements iam.IResourceWithPolicy
{
  public readonly env: cdk.ResourceEnvironment;

  private readonly dataAccessPolicyDocument: Array<DataAccessPolicyStatement> =
    [];

  private readonly collection: osServerless.CfnCollection;

  public constructor(
    scope: Construct,
    id: string,
    props: OpenSearchDataAccessPolicyProps
  ) {
    super(scope, id, {
      name: cdk.Names.uniqueResourceName(scope, {
        maxLength: 31,
      }).toLowerCase(),
      type: "data",
      policy: JSON.stringify([]),
    });

    const { account, region } = cdk.Stack.of(this);
    this.env = {
      account,
      region,
    };

    this.collection = props.collection;
  }

  public addToResourcePolicy(
    statement: iam.PolicyStatement
  ): iam.AddToResourcePolicyResult {
    if (statement.resources.length !== 1) {
      throw new Error("Can only add a single resource to a policy statement");
    }

    if (statement.principals.length === 0) {
      throw new Error("Policy statement must have at least one principal");
    }

    if (statement.effect !== iam.Effect.ALLOW) {
      throw new Error("Policy statement must have effect ALLOW");
    }

    const validResourceTypes = ["collection", "index"];
    const resourceType = statement.resources[0].split("/")[0];
    if (!validResourceTypes.includes(resourceType)) {
      throw new Error(
        `Resource type ${resourceType} is not valid. It must be one of: ${validResourceTypes.join(
          ", "
        )}`
      );
    }

    const validCollectionPermissions = [
      "aoss:CreateCollectionItems",
      "aoss:DeleteCollectionItems",
      "aoss:UpdateCollectionItems",
      "aoss:DescribeCollectionItems",
      "aoss:*",
    ];

    const validIndexPermissions = [
      "aoss:UpdateIndex",
      "aoss:DescribeIndex",
      "aoss:CreateIndex",
      "aoss:ReadDocument",
      "aoss:WriteDocument",
      "aoss:DeleteIndex",
    ];

    if (resourceType === "collection") {
      const invalidPermissions = statement.actions.filter(
        (action) => !validCollectionPermissions.includes(action)
      );
      if (invalidPermissions.length > 0) {
        throw new Error(
          `Invalid permissions for collection resource: ${invalidPermissions.join(
            ", "
          )}. Valid permissions are: ${validCollectionPermissions.join(", ")}`
        );
      }

      this.dataAccessPolicyDocument.push({
        Rules: [
          {
            Resource: [statement.resources[0]],
            Permission: statement.actions,
            ResourceType: "collection",
          },
        ],
        Principal: statement.principals.map((p) => this.getArnFromPrincipal(p)),
        Description: statement.sid,
      });
    }

    if (resourceType === "index") {
      const invalidPermissions = statement.actions.filter(
        (action) => !validIndexPermissions.includes(action)
      );
      if (invalidPermissions.length > 0) {
        throw new Error(
          `Invalid permissions for index resource: ${invalidPermissions.join(
            ", "
          )}. Valid permissions are: ${validIndexPermissions.join(", ")}`
        );
      }

      this.dataAccessPolicyDocument.push({
        Rules: [
          {
            Resource: [statement.resources[0]],
            Permission: statement.actions,
            ResourceType: "index",
          },
        ],
        Principal: statement.principals.map((p) => this.getArnFromPrincipal(p)),
        Description: statement.sid,
      });
    }

    this.policy = JSON.stringify(this.dataAccessPolicyDocument);

    return {
      statementAdded: true,
    };
  }

  public grantRead(grantee: iam.IGrantable): iam.Grant {
    // This is differeny from the read write
    return iam.Grant.addToPrincipalAndResource({
      grantee,
      actions: ["aoss:DescribeCollectionItems"],
      resourceArns: [`collection/${this.collection.name}`],
      resource: this,
    }).combine(
      iam.Grant.addToPrincipalAndResource({
        grantee,
        actions: ["aoss:DescribeIndex", "aoss:ReadDocument"],
        resourceArns: [`index/${this.collection.name}/*`],
        resource: this,
      })
    );
  }

  public grantReadWrite(grantee: iam.IGrantable): iam.Grant {
    this.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: [
          "aoss:DescribeCollectionItems",
          "aoss:CreateCollectionItems",
          "aoss:UpdateCollectionItems",
          "aoss:DeleteCollectionItems",
        ],
        effect: iam.Effect.ALLOW,
        principals: [grantee.grantPrincipal],
        resources: [`collection/${this.collection.name}`],
      })
    );

    this.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: [
          "aoss:UpdateIndex",
          "aoss:DescribeIndex",
          "aoss:CreateIndex",
          "aoss:ReadDocument",
          "aoss:WriteDocument",
          "aoss:DeleteIndex",
        ],
        effect: iam.Effect.ALLOW,
        principals: [grantee.grantPrincipal],
        resources: [`index/${this.collection.name}/*`],
      })
    );

    return iam.Grant.drop(grantee, "");
  }

  private getArnFromPrincipal(principal: iam.IPrincipal): string {
    if (principal instanceof iam.AccountPrincipal) {
      return `arn:aws:iam::${principal.accountId}:root`;
    }

    if (principal instanceof iam.ArnPrincipal) {
      return principal.arn;
    }

    if (principal instanceof iam.ServicePrincipal) {
      // Service principals don't have a direct ARN, but you can construct one
      return `arn:aws:iam::${cdk.Stack.of(this).account}:role/service-role/${
        principal.service
      }`;
    }

    if (principal instanceof iam.Role) {
      return principal.roleArn;
    }

    if (principal instanceof iam.User) {
      return principal.userArn;
    }

    if (principal instanceof iam.Group) {
      return principal.groupArn;
    }

    if ("grantPrincipal" in principal) {
      // For IGrantable objects
      return this.getArnFromPrincipal(principal.grantPrincipal);
    }

    type NewType = any;

    // For custom principal implementations
    if (typeof (principal as NewType).arn === "string") {
      return (principal as any).arn;
    }

    throw new Error("Unable to extract ARN from principal");
  }
}
