import { Construct } from "constructs";
import * as osServerless from "aws-cdk-lib/aws-opensearchserverless";
import * as iam from "aws-cdk-lib/aws-iam";

import * as cdk from "aws-cdk-lib";
import { LambdaFunction } from "./lambda-function";
import * as path from "path";
import * as cr from "aws-cdk-lib/custom-resources";
import * as logs from "aws-cdk-lib/aws-logs";
import { OpenSearchDataAccessPolicy } from "./open-search-data-access-policy";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

interface VectorStoreProps {
  name: string;
  indexName: string;
  deleteOldIndices?: boolean;
  enableStandbyReplicas?: boolean;
}

interface IndexConfiguration {
  dimension: number;
  metadataField: string;
  textField: string;
  vectorField: string;
}

export class VectorStore extends Construct {
  public readonly collection: osServerless.CfnCollection;
  public readonly vectorIndexName: string;

  public readonly fieldMapping = {
    vectorField: "bedrock-knowledge-base-vector", // Updating this name is not supported!! Does not have effect
    metadataField: "AMAZON_BEDROCK_METADATA",
    textField: "AMAZON_BEDROCK_TEXT_CHUNK",
  };

  private readonly dataAccessPolicy: OpenSearchDataAccessPolicy;
  private readonly createIndexFunction: NodejsFunction;
  private readonly customResourceProvider: cr.Provider;

  public constructor(scope: Construct, id: string, props: VectorStoreProps) {
    super(scope, id);

    this.vectorIndexName = props.indexName;

    this.collection = this.createCollection({ name: props.name });

    this.dataAccessPolicy = new OpenSearchDataAccessPolicy(
      this,
      "data-access-policy",
      {
        collection: this.collection,
      }
    );

    [
      /**
       * For now, public access is granted, if this would not be the case,
       * the custom resource would need to run in a VPC with VPC endpoint.
       * This would increase cost and complexity.
       *
       * Hence, for evaluation purposes, this is fine.
       */
      this.createNetworkPolicy(this.collection.name),
      this.createEncryptionPolicy(this.collection.name),
      this.dataAccessPolicy,
    ].forEach((policy) => this.collection.addDependency(policy));

    const { function: createIndexFunction } = new LambdaFunction(
      this,
      "create-index",
      {
        functionProps: {
          entry: path.join(__dirname, "..", "lambda/create-index/handler.ts"),
          environment: {
            OPENSEARCH_DOMAIN: this.collection.attrCollectionEndpoint,
          },
          timeout: cdk.Duration.minutes(5),
        },
      }
    );

    this.createIndexFunction = createIndexFunction;
    this.grantReadWrite(createIndexFunction.role!);

    this.customResourceProvider = new cr.Provider(
      this,
      "create-index-provider",
      {
        onEventHandler: this.createIndexFunction,
        logRetention: logs.RetentionDays.ONE_DAY,
      }
    );

    this.createIndexFunction.role?.addManagedPolicy(
      new iam.ManagedPolicy(this, "aoss-policy", {
        statements: [
          new iam.PolicyStatement({
            sid: "AllowCreateIndex",
            effect: iam.Effect.ALLOW,
            actions: ["aoss:APIAccessAll"],
            // When passing in the collection, there is a circular dependency
            resources: ["*"],
          }),
        ],
      })
    );
  }

  public grantRead(grantee: iam.IGrantable): iam.Grant {
    return this.dataAccessPolicy.grantRead(grantee);
  }

  public grantReadWrite(grantee: iam.IGrantable): void {
    iam.Grant.addToPrincipal({
      grantee,
      actions: ["aoss:APIAccessAll"],
      resourceArns: ["*"],
    });
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

  public createIndex(indexName: string, config: IndexConfiguration) {
    const customResource = new cdk.CustomResource(
      this,
      `${cdk.Names.uniqueResourceName(this, {})}-${indexName}`,
      {
        serviceToken: this.customResourceProvider.serviceToken,
        properties: {
          INDEX_NAME: indexName,
          INDEX_CONFIGURATION: {
            DIMENSION: config.dimension,
            MAPPING_FIELD_METADATA: config.metadataField,
            MAPPING_FIELD_TEXT_CHUNK: config.textField,
            VECTOR_FIELD: config.vectorField,
          },
        },
      }
    );

    return customResource;
  }
}
