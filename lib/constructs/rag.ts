import * as cdk from "aws-cdk-lib";
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import * as osServerless from "aws-cdk-lib/aws-opensearchserverless";

import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import * as cr from "aws-cdk-lib/custom-resources";
import { LambdaFunction } from "./lambda-function";
import path = require("path");
import * as logs from "aws-cdk-lib/aws-logs";

export class Rag extends Construct {
  public constructor(scope: Construct, id: string) {
    super(scope, id);

    const sourceDataBucket = this.createDataSourceBucket();
    const name = "demo-example";
    const role = this.createServiceRole(sourceDataBucket);

    const collection = this.createOpenSearchCollection(name);
    const createIndexFunction = this.createOpenSearchIndex(collection);
    const policies = [
      this.createNetworkPolicy(name),
      this.createDataAccessPolicy(name, [role, createIndexFunction.role!]),
      this.createEncryptionPolicy(name),
    ];
    for (const policy of policies) {
      collection.addDependency(policy);
    }

    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["aoss:*"],
        resources: [collection.attrArn],
      })
    );

    // this.createKnowledgeBase({ collection, role });
  }

  private createOpenSearchCollection(name: string) {
    const collection = new osServerless.CfnCollection(this, "collection", {
      name,
      //   https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-opensearchserverless-collection.html#cfn-opensearchserverless-collection-standbyreplicas
      standbyReplicas: "DISABLED",
      type: "VECTORSEARCH",
    });

    collection.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    return collection;
  }

  private createDataAccessPolicy(name: string, roles: Array<iam.IRole>) {
    return new osServerless.CfnAccessPolicy(this, "data-access-policy", {
      name,
      type: "data",
      policy: JSON.stringify([
        {
          Rules: [
            {
              Resource: [`collection/${name}`],
              Permission: [
                "aoss:DescribeCollectionItems",
                "aoss:CreateCollectionItems",
                "aoss:UpdateCollectionItems",
              ],
              ResourceType: "collection",
            },
            {
              Resource: [`index/${name}/*`],
              Permission: [
                "aoss:UpdateIndex",
                "aoss:DescribeIndex",
                "aoss:ReadDocument",
                "aoss:WriteDocument",
                "aoss:CreateIndex",
              ],
              ResourceType: "index",
            },
          ],
          Principal: [
            ...roles.map((role) => role.roleArn),
            new iam.AccountPrincipal(cdk.Stack.of(this).account).arn,
          ],
          Description: "",
        },
      ]),
    });
  }

  private createDataSourceBucket() {
    const sourceDataBucket = new s3.Bucket(this, "source-data-bucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    new cdk.CfnOutput(this, "source-data-bucket-name", {
      value: sourceDataBucket.bucketName,
    });

    return sourceDataBucket;
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

  private createKnowledgeBase({
    collection,
    role,
  }: {
    collection: osServerless.CfnCollection;
    role: iam.Role;
  }) {
    return new bedrock.CfnKnowledgeBase(this, "knowledge-base", {
      name: "demo-example",
      roleArn: role.roleArn,
      storageConfiguration: {
        opensearchServerlessConfiguration: {
          collectionArn: collection.attrArn,
          vectorIndexName: "bedrock-knowledge-base-default-index",
          fieldMapping: {
            metadataField: "AMAZON_BEDROCK_METADATA",
            vectorField: "bedrock-knowledge-base-default-vector",
            textField: "AMAZON_BEDROCK_TEXT_CHUNK",
          },
        },
        type: "OPENSEARCH_SERVERLESS",
      },
      knowledgeBaseConfiguration: {
        type: "VECTOR",
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn:
            "arn:aws:bedrock:eu-central-1::foundation-model/cohere.embed-english-v3",
        },
      },
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
          AllowFromPublic: true,
        },
      ]),
    });
  }

  private createOpenSearchIndex(collection: osServerless.CfnCollection) {
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

    // const customResourceProvider = new cr.Provider(
    //   this,
    //   "create-index-provider",
    //   {
    //     onEventHandler: createIndexFunction,
    //     logRetention: logs.RetentionDays.ONE_DAY,
    //   }
    // );

    // new cdk.CustomResource(this, "create-index-custom-resource", {
    //   serviceToken: customResourceProvider.serviceToken,
    //   properties: {
    //     UpdateTime: new Date().toISOString(),
    //   },
    // });

    createIndexFunction.role?.addManagedPolicy(
      new iam.ManagedPolicy(this, "aoss-policy", {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["*"],
            resources: ["*"],
          }),
        ],
      })
    );

    new cdk.CfnOutput(this, "create-index-function-arn", {
      value: createIndexFunction.functionArn,
    });

    return createIndexFunction;
  }

  private createServiceRole(dataSourceBucket: s3.Bucket) {
    const role = new iam.Role(this, "knowledge-base-role", {
      assumedBy: new iam.ServicePrincipal("bedrock.amazonaws.com"),
    });

    dataSourceBucket.grantRead(role);
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["*"],
        resources: ["*"],
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

    return role;
  }
}
