import { Construct } from "constructs";
import * as osServerless from "aws-cdk-lib/aws-opensearchserverless";
import * as iam from "aws-cdk-lib/aws-iam";

import * as cdk from "aws-cdk-lib";
import { LambdaFunction } from "./lambda-function";
import * as path from "path";
import * as cr from "aws-cdk-lib/custom-resources";
import * as logs from "aws-cdk-lib/aws-logs";
import { CfnResource } from "aws-cdk-lib";
import { Port } from "aws-cdk-lib/aws-ec2";
import { FoundationModel } from "aws-cdk-lib/aws-bedrock";
import { OpenSearchDataAccessPolicy } from "./open-search-data-access-policy";

interface VectorStoreProps {
  name: string;
  indexName: string;
  deleteOldIndices?: boolean;
  enableStandbyReplicas?: boolean;
  // readRoles?: iam.IRole[];
  // writeRoles?: iam.IRole[];
  readWriteRoles?: iam.IRole[];
}

type DataAccessPolicyStatement = {
  Rules: {
    Resource: string[];
    Permission: string[];
    ResourceType: string;
  }[];
  Principal: string[];
  Description?: string;
};

export class VectorStore extends cdk.NestedStack {
  public readonly collection: osServerless.CfnCollection;
  public readonly vectorIndexName: string;

  public readonly fieldMapping = {
    vectorField: "bedrock-knowledge-base-vector", // Updating this name is not supported!! Does not have effect
    metadataField: "AMAZON_BEDROCK_METADATA",
    textField: "AMAZON_BEDROCK_TEXT_CHUNK",
  };

  private readonly dataAccessPolicy: OpenSearchDataAccessPolicy;

  public constructor(scope: Construct, id: string, props: VectorStoreProps) {
    super(scope, id);

    this.vectorIndexName = props.indexName;

    this.collection = this.createCollection({ name: props.name });
    /**
     * For now, public access is granted, if this would not be the case,
     * the custom resource would need to run in a VPC with VPC endpoint.
     * This would increase cost and complexity.
     *
     * Hence, for evaluation purposes, this is fine.
     */
    this.createNetworkPolicy(this.collection.name);

    this.dataAccessPolicy = new OpenSearchDataAccessPolicy(
      this,
      "data-access-policy",
      {
        collection: this.collection,
      }
    );

    // const { customResource, executionRole } = this.createIndex({
    //   collection: this.collection,
    //   deleteOldIndices: props.deleteOldIndices,
    //   indexName: props.indexName,
    // });

    // this.dataAccessPolicy = this.createDataAccessPolicy(
    //   props.name,
    //   executionRole!
    // );

    // customResource.node.addDependency(this.dataAccessPolicy);

    // const policies = [
    //   this.dataAccessPolicy,
    //   this.createNetworkPolicy(props.name),
    //   this.createEncryptionPolicy(props.name),
    // ];
    // for (const policy of policies) {
    //   this.collection.addDependency(policy);
    // }

    // // props.readRoles?.forEach((role) => this.grantRead(role));
    // // props.writeRoles?.forEach((role) => this.grantWrite(role));
    // props.readWriteRoles?.forEach((role) => this.grantReadWrite(role));

    // this.node.addDependency(customResource);
  }

  // private addDependencyOnAllChildren() {
  //   const children = this.node.findAll();

  //   children.forEach(child => {
  //     if (child instanceof CfnResource) {
  //       this.node.addDependency(child);
  //     }
  //   });
  // }

  public grantRead(grantee: iam.IGrantable): iam.Grant {
    return this.dataAccessPolicy.grantRead(grantee);
  }

  public grantReadWrite(grantee: iam.IGrantable): void {
    this.dataAccessPolicy.grantReadWrite(grantee);
  }

  private createCollection({
    name,
    enableStandbyReplicas = false,
  }: {
    name: string;
    enableStandbyReplicas?: boolean;
  }) {
    const standbyReplicas = enableStandbyReplicas ? "ENABLED" : "DISABLED";

    const collection = new osServerless.CfnCollection(this, "collection", {
      name,
      // name: cdk.Names.uniqueResourceName(this, {}),
      //   https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-opensearchserverless-collection.html#cfn-opensearchserverless-collection-standbyreplicas
      standbyReplicas,
      type: "VECTORSEARCH",
    });

    collection.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    return collection;
  }

  private createEncryptionPolicy(name: string) {
    return new osServerless.CfnSecurityPolicy(this, "encryption-policy", {
      name: name,
      type: "encryption",
      policy: JSON.stringify({
        Rules: [
          {
            Resource: [`collection/${name}`],
            ResourceType: "collection",
          },
        ],
        AWSOwnedKey: true,
      }),
    });
  }

  private createNetworkPolicy(name: string) {
    return new osServerless.CfnSecurityPolicy(this, "security-policy", {
      name: name,
      type: "network",
      policy: JSON.stringify([
        {
          Rules: [
            {
              Resource: [`collection/${name}`],
              ResourceType: "dashboard",
            },
            {
              Resource: [`collection/${name}`],
              ResourceType: "collection",
            },
          ],
          //   TODO not best practice
          AllowFromPublic: true,
        },
      ]),
    });
  }

  private createIndex({
    collection,
    indexName,
    deleteOldIndices = false,
  }: {
    collection: osServerless.CfnCollection;
    indexName: string;
    deleteOldIndices?: boolean;
  }) {
    const { function: createIndexFunction } = new LambdaFunction(
      this,
      "create-index",
      {
        functionProps: {
          entry: path.join(__dirname, "..", "lambda/create-index/handler.ts"),
          environment: {
            OPENSEARCH_DOMAIN: collection.attrCollectionEndpoint,
          },
        },
      }
    );

    const customResourceProvider = new cr.Provider(
      this,
      "create-index-provider",
      {
        onEventHandler: createIndexFunction,
        logRetention: logs.RetentionDays.ONE_DAY,
      }
    );

    const customResource = new cdk.CustomResource(
      this,
      "create-index-custom-resource",
      {
        serviceToken: customResourceProvider.serviceToken,
        properties: {
          DELETE_OLD_INDICES: deleteOldIndices,
          INDEX_NAME: indexName,
          INDEX_CONFIGURATION: {
            DIMENSION: 1024, // TODO depending of model
            MAPPING_FIELD_METADATA: this.fieldMapping.metadataField,
            MAPPING_FIELD_TEXT_CHUNK: this.fieldMapping.textField,
            VECTOR_FIELD: this.fieldMapping.vectorField,
          },
        },
      }
    );

    createIndexFunction.role?.addManagedPolicy(
      new iam.ManagedPolicy(this, "aoss-policy", {
        statements: [
          new iam.PolicyStatement({
            sid: "AllowCreateIndex",
            effect: iam.Effect.ALLOW,
            actions: [
              "aoss:DescribeCollection",
              "aoss:DescribeIndex",
              "aoss:CreateIndex",
              // TODO scope down permissions - might move to data access policy
              "aoss:*",
            ],
            resources: ["*"],
          }),
        ],
      })
    );

    return { customResource, executionRole: createIndexFunction.role };
  }
}
