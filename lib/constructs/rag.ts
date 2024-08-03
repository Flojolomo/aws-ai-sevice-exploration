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
    const modelId = "cohere.embed-english-v3";
    const role = this.createServiceRole(sourceDataBucket, modelId);

    const collection = this.createOpenSearchCollection(name);
    const createIndexFunction = this.createOpenSearchIndex(collection, modelId);
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

    const knowledgeBase = this.createKnowledgeBase({
      bucket: sourceDataBucket,
      modelId,
      collection,
      role,
    });

    this.createTestLambda(knowledgeBase, "anthropic.claude-v2");
  }

  private createOpenSearchCollection(name: string) {
    const collection = new osServerless.CfnCollection(this, "collection", {
      name,
      //   https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-opensearchserverless-collection.html#cfn-opensearchserverless-collection-standbyreplicas
      standbyReplicas: "DISABLED",
      type: "VECTORSEARCH",
    });

    collection.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    new cdk.CfnOutput(this, "collection-arn", {
      value: collection.attrArn,
    });

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
                // TMP
                "aoss:DeleteIndex",
              ],
              ResourceType: "index",
            },
          ],
          Principal: [
            ...roles.map((role) => role.roleArn),
            "arn:aws:sts::014498645519:assumed-role/AWSReservedSSO_AWSAdministratorAccess_2e415d69fac08946/florian1siegel@googlemail.com",
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
    bucket,
    collection,
    modelId,
    role,
  }: {
    bucket: s3.Bucket;
    collection: osServerless.CfnCollection;
    modelId: string;
    role: iam.Role;
  }) {
    const knowledgeBase = new bedrock.CfnKnowledgeBase(this, "knowledge-base", {
      name: "demo-example",
      roleArn: role.roleArn,
      storageConfiguration: {
        opensearchServerlessConfiguration: {
          collectionArn: collection.attrArn,
          vectorIndexName: "my-index",
          fieldMapping: {
            vectorField: "bedrock-knowledge-base-default-vector",
            metadataField: "AMAZON_BEDROCK_METADATA",
            textField: "AMAZON_BEDROCK_TEXT_CHUNK",
          },
        },
        type: "OPENSEARCH_SERVERLESS",
      },
      knowledgeBaseConfiguration: {
        type: "VECTOR",
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:eu-central-1::foundation-model/${modelId}`,
        },
      },
    });

    const dataSource = new bedrock.CfnDataSource(this, "data-source", {
      name: "demo-example",
      knowledgeBaseId: knowledgeBase.ref,
      // Otherwise the deletion fails due to permissions issues
      dataDeletionPolicy: "RETAIN",
      dataSourceConfiguration: {
        type: "S3",
        s3Configuration: {
          bucketArn: bucket.bucketArn,
        },
      },
    });

    new cdk.CfnOutput(this, "knowledge-base-id", {
      value: knowledgeBase.getAtt("KnowledgeBaseId").toString(),
    });

    new cdk.CfnOutput(this, "data-source-id", {
      value: dataSource.getAtt("DataSourceId").toString(),
    });

    return knowledgeBase;
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

  private createOpenSearchIndex(
    collection: osServerless.CfnCollection,
    modelId: string
  ) {
    const { function: createIndexFunction } = new LambdaFunction(
      this,
      "create-index",
      {
        functionProps: {
          entry: path.join(__dirname, "..", "lambda/create-index/handler.ts"),
          environment: {
            OPENSEARCH_DOMAIN: collection.attrCollectionEndpoint,
            MODEL_ID: modelId,
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

    /** Updates only, if parameters change!! */
    new cdk.CustomResource(this, "create-index-custom-resource", {
      serviceToken: customResourceProvider.serviceToken,
      properties: {
        // UpdateTime: new Date().toISOString(),
        MODEL_ID: modelId,
      },
    });

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

  private createServiceRole(
    dataSourceBucket: s3.Bucket,
    embeddingModelId: string
  ) {
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
        resources: [
          "*",
          // TODO limit to the model used in the knowledge base
          `arn:aws:bedrock:eu-central-1::foundation-model/${embeddingModelId}`,
        ],
      })
    );

    new cdk.CfnOutput(this, "knowledge-base-role-arn", {
      value: role.roleArn,
    });

    return role;
  }

  private createTestLambda(
    knowledgeBase: bedrock.CfnKnowledgeBase,
    modelId: string
  ) {
    const { function: testFunction } = new LambdaFunction(
      this,
      "test-knowledgebase-function",
      {
        functionProps: {
          entry: path.join(
            __dirname,
            "..",
            "lambda/query-knowledge-base/handler.ts"
          ),
          environment: {
            MODEl_ID: modelId,
            KNOWLEDGEBASE_ID: knowledgeBase
              .getAtt("KnowledgeBaseId")
              .toString(),
          },
        },
      }
    );

    new cdk.CfnOutput(this, "test-knowledgebase-function-name", {
      value: testFunction.functionName,
    });
  }
}
