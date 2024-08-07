import { Construct } from "constructs";
import * as osServerless from "aws-cdk-lib/aws-opensearchserverless";
import * as iam from "aws-cdk-lib/aws-iam";

import * as cdk from "aws-cdk-lib";
import { LambdaFunction } from "./lambda-function";
import * as path from "path";
import * as cr from "aws-cdk-lib/custom-resources";
import * as logs from "aws-cdk-lib/aws-logs";

interface VectorStoreProps {
  embeddingModelId: string;
  name: string;
  indexName: string;
  deleteOldIndices?: boolean;
  enableStandbyReplicas?: boolean;
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

export class VectorStore extends Construct {
  public readonly collection: osServerless.CfnCollection;

  private readonly dataAccessPolicy: osServerless.CfnAccessPolicy;
  private readonly dataAccessPolicyDocument: Array<DataAccessPolicyStatement> =
    [];
  private readonly deleteOldIndices: boolean;

  private readonly mappingFieldMetadata = "AMAZON_BEDROCK_METADATA";
  private readonly mappingFieldTextChunk = "AMAZON_BEDROCK_TEXT_CHUNK";
  private readonly vectorField = "bedrock-knowledge-base-default-vector";

  public constructor(scope: Construct, id: string, props: VectorStoreProps) {
    super(scope, id);
    this.deleteOldIndices = props.deleteOldIndices ?? false;

    this.collection = this.createCollection({ name: props.name });
    const { customResource, executionRole } = this.createIndex({
      collection: this.collection,
      embeddingModelId: props.embeddingModelId,
      deleteOldIndices: props.deleteOldIndices,
      indexName: props.indexName,
    });

    this.dataAccessPolicy = this.createDataAccessPolicy(
      props.name,
      executionRole!
    );

    customResource.node.addDependency(this.dataAccessPolicy);

    const policies = [
      this.dataAccessPolicy,
      this.createNetworkPolicy(props.name),
      this.createEncryptionPolicy(props.name),
    ];
    for (const policy of policies) {
      this.collection.addDependency(policy);
    }

    this.grantRead(new iam.AccountPrincipal(cdk.Stack.of(this).account).arn);
  }

  public grantRead(arn: string): void {
    this.dataAccessPolicyDocument.push({
      Rules: [
        {
          Resource: [`collection/${this.collection.name}`],
          Permission: ["aoss:DescribeCollectionItems"],
          ResourceType: "collection",
        },
        {
          Resource: [`index/${this.collection.name}/*`],
          Permission: ["aoss:DescribeIndex", "aoss:ReadDocument"],
          ResourceType: "index",
        },
      ],
      Principal: [arn],
    });

    this.dataAccessPolicy.policy = JSON.stringify(
      this.dataAccessPolicyDocument
    );
  }

  public grantWrite(role: iam.IRole): void {
    // TODO
  }

  public grantReadWrite(role: iam.IRole): void {
    this.dataAccessPolicyDocument.push({
      Rules: [
        {
          Resource: [`collection/${this.collection.name}`],
          Permission: [
            "aoss:DescribeCollectionItems",
            "aoss:CreateCollectionItems",
            "aoss:UpdateCollectionItems",
          ],
          ResourceType: "collection",
        },
        {
          Resource: [`index/${this.collection.name}/*`],
          Permission: [
            "aoss:UpdateIndex",
            "aoss:DescribeIndex",
            "aoss:DeleteIndex",
            "aoss:CreateIndex",
            "aoss:ReadDocument",
            "aoss:WriteDocument",
            // TMP
          ],
          ResourceType: "index",
        },
      ],
      Principal: [role.roleArn],
      Description: "",
    });

    this.node.addDependency(role);
    this.dataAccessPolicy.policy;
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

  private createDataAccessPolicy(
    name: string,
    roleForCreatingIndices: iam.IRole
  ) {
    this.dataAccessPolicyDocument.push({
      Rules: [
        {
          Resource: [`index/${name}/*`],
          Permission: [
            "aoss:UpdateIndex",
            "aoss:DescribeIndex",
            "aoss:DeleteIndex",
            "aoss:CreateIndex",
          ],
          ResourceType: "index",
        },
      ],
      Principal: [roleForCreatingIndices.roleArn],
    });

    return new osServerless.CfnAccessPolicy(this, "data-access-policy", {
      name,
      type: "data",
      policy: JSON.stringify(this.dataAccessPolicyDocument),
    });
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
    embeddingModelId,
    indexName,
    deleteOldIndices = false,
  }: {
    collection: osServerless.CfnCollection;
    embeddingModelId: string;
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
          DATE: Date.now(),
          DELETE_OLD_INDICES: deleteOldIndices,
          EMBEDDING_MODEL_ID: embeddingModelId,
          INDEX_NAME: indexName,
          INDEX_CONFIGURATION: {
            DIMENSION: 1024,
            MAPPING_FIELD_METADATA: this.mappingFieldMetadata,
            MAPPING_FIELD_TEXT_CHUNK: this.mappingFieldTextChunk,
            VECTOR_FIELD: this.vectorField,
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
