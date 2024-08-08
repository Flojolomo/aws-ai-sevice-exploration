import { Construct } from "constructs";
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import * as iam from "aws-cdk-lib/aws-iam";
import * as osServerless from "aws-cdk-lib/aws-opensearchserverless";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import {
  ChunkingConfiguration,
  KnowledgeBaseDataSource,
} from "./knowledge-base-data-source";
import { VectorStore } from "./vector-store";
import { CronOptions } from "aws-cdk-lib/aws-events";

interface KnowledgeBaseProps {
  dataSourceId?: string;
  embeddingModel: bedrock.FoundationModel;
  vectorDimension: number;
  vectorStore: VectorStore;
  sourceBucket?: s3.Bucket;
  syncSchedule?: CronOptions;
  syncOnCreate?: boolean;
}

export class KnowledgeBase extends Construct {
  public readonly role: iam.Role;
  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  public readonly dataSource: bedrock.CfnDataSource;

  public constructor(scope: Construct, id: string, props: KnowledgeBaseProps) {
    super(scope, id);

    this.role = new iam.Role(this, "knowledge-base-role", {
      assumedBy: new iam.ServicePrincipal("bedrock.amazonaws.com"),
    });

    const sourceBucket =
      props.sourceBucket ??
      new s3.Bucket(this, "source-bucket", {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
      });

    const knowledgeBaseName = cdk.Names.uniqueResourceName(this, {
      maxLength: 64,
    });

    props.vectorStore.grantReadWrite(this.role);
    sourceBucket.grantReadWrite(this.role);
    this.role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: [props.embeddingModel.modelArn],
      })
    );

    const indexName = knowledgeBaseName.toLowerCase();
    const index = props.vectorStore.createIndex(indexName, {
      dimension: props.vectorDimension,
      metadataField: "METADATA",
      textField: "TEXT_CHUNK",
      vectorField: knowledgeBaseName,
    });

    this.knowledgeBase = new bedrock.CfnKnowledgeBase(this, "knowledge-base", {
      name: knowledgeBaseName,
      roleArn: this.role.roleArn,
      storageConfiguration: {
        opensearchServerlessConfiguration: {
          collectionArn: props.vectorStore.collection.attrArn,
          vectorIndexName: indexName,
          fieldMapping: {
            vectorField: knowledgeBaseName,
            metadataField: "METADATA",
            textField: "TEXT_CHUNK",
          },
        },
        type: "OPENSEARCH_SERVERLESS",
      },
      knowledgeBaseConfiguration: {
        type: "VECTOR",
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: props.embeddingModel.modelArn,
        },
      },
    });

    this.knowledgeBase.node.addDependency(index);

    new KnowledgeBaseDataSource(this, "data-source", {
      bucket: sourceBucket,
      knowledgeBase: this.knowledgeBase,
      name: props.dataSourceId ?? "default",
    });
  }

  public syncDataSourceAfterCreation() {
    // TODO start sync
  }

  public syncDataSourceOnSchedule() {
    // TODO start sync
  }

  public addDataSource(
    id: string,
    {
      chunkingConfiguration,
      description,
      inclusionPrefixes,
    }: {
      description?: string;
      chunkingConfiguration?: ChunkingConfiguration;
      inclusionPrefixes?: string[];
    } = {}
  ) {
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_bedrock.CfnDataSource.html

    const sourceBucket = new s3.Bucket(this, `source-bucket-${id}`, {
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    sourceBucket.grantRead(this.role);
    new KnowledgeBaseDataSource(this, `data-source-${id}`, {
      bucket: sourceBucket,
      chunkingConfiguration,
      description,
      inclusionPrefixes,
      knowledgeBase: this.knowledgeBase,
      name: id,
    });
  }
}
