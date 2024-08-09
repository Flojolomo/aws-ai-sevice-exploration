import { Construct } from "constructs";
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import {
  ChunkingConfiguration,
  KnowledgeBaseDataSource,
} from "./knowledge-base-data-source";
import { VectorStore } from "./vector-store";
import { CronOptions } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "./lambda-function";
import path = require("path");
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as cr from "aws-cdk-lib/custom-resources";
import * as logs from "aws-cdk-lib/aws-logs";

interface KnowledgeBaseProps {
  dataSourceId?: string;
  embeddingModel: bedrock.FoundationModel;
  vectorDimension: number;
  vectorStore: VectorStore;
  sourceBucket?: s3.Bucket;
  syncSchedule?: CronOptions;
  syncAfterCreation?: boolean;
}

export class KnowledgeBase extends Construct {
  public readonly role: iam.Role;
  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  public readonly dataSource: bedrock.CfnDataSource;

  private startIngestionJobFunction?: NodejsFunction;
  private injectDataAfterCreationFunction?: NodejsFunction;
  private customResourceProvider?: cr.Provider;

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

    const dataSourceName = props.dataSourceId ?? "default";
    const dataSource = new KnowledgeBaseDataSource(this, "data-source", {
      bucket: sourceBucket,
      knowledgeBase: this.knowledgeBase,
      name: dataSourceName,
    });

    if (!(props.syncSchedule || props.syncAfterCreation)) {
      return;
    }

    this.createFunctionToStartIngestionJob();

    if (props.syncSchedule) {
      this.syncDataSourceOnSchedule(
        dataSource.attrDataSourceId,
        props.syncSchedule
      );
    }

    if (props.syncAfterCreation) {
      this.syncDataSourceAfterCreation(
        dataSourceName,
        dataSource.attrDataSourceId
      );
    }
  }

  public addDataSource(
    id: string,
    {
      chunkingConfiguration,
      description,
      inclusionPrefixes,
      syncSchedule,
      syncAfterCreation,
    }: {
      description?: string;
      chunkingConfiguration?: ChunkingConfiguration;
      inclusionPrefixes?: string[];
      syncSchedule?: CronOptions;
      syncAfterCreation?: boolean;
    } = {}
  ) {
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_bedrock.CfnDataSource.html

    const sourceBucket = new s3.Bucket(this, `source-bucket-${id}`, {
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    sourceBucket.grantRead(this.role);
    const dataSource = new KnowledgeBaseDataSource(this, `data-source-${id}`, {
      bucket: sourceBucket,
      chunkingConfiguration,
      description,
      inclusionPrefixes,
      knowledgeBase: this.knowledgeBase,
      name: id,
    });

    if (syncSchedule) {
      this.syncDataSourceOnSchedule(dataSource.attrDataSourceId, syncSchedule);
    }

    if (syncAfterCreation) {
      this.syncDataSourceAfterCreation(id, dataSource.attrDataSourceId);
    }
  }

  private createFunctionToStartIngestionJob() {
    if (this.startIngestionJobFunction) {
      return this.startIngestionJobFunction;
    }

    const { function: startIngestionJobFunction } = new LambdaFunction(
      this,
      "start-ingestion-job-data-source",
      {
        functionProps: {
          entry: path.join(
            __dirname,
            "..",
            "lambda/start-ingestion-job/start-sync.ts"
          ),
        },
      }
    );

    startIngestionJobFunction.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "StartIngestionJobOnSchedule",
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:StartIngestionJob"],
        resources: [this.knowledgeBase.attrKnowledgeBaseArn],
      })
    );

    this.startIngestionJobFunction = startIngestionJobFunction;
    return startIngestionJobFunction;
  }

  private createFunctionIngestAfterCreation() {
    if (this.injectDataAfterCreationFunction) {
      return {
        injectDataAfterCreationFunction: this.injectDataAfterCreationFunction,
        customResourceProvider: this.customResourceProvider,
      };
    }

    const { function: injectDataAfterCreationFunction } = new LambdaFunction(
      this,
      "start-ingestion-job-after-creation-data-source",
      {
        functionProps: {
          entry: path.join(
            __dirname,
            "..",
            "lambda/start-ingestion-job/custom-resource.ts"
          ),
        },
      }
    );

    injectDataAfterCreationFunction.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "StartIngestionJobAfterCreation",
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:StartIngestionJob"],
        resources: [this.knowledgeBase.attrKnowledgeBaseArn],
      })
    );

    const customResourceProvider = new cr.Provider(
      this,
      "sync-after-creation",
      {
        onEventHandler: injectDataAfterCreationFunction,
        logRetention: logs.RetentionDays.ONE_DAY,
      }
    );

    this.injectDataAfterCreationFunction = injectDataAfterCreationFunction;
    this.customResourceProvider = customResourceProvider;

    return {
      injectDataAfterCreationFunction,
      customResourceProvider,
    };
  }

  private syncDataSourceAfterCreation(id: string, dataSourceId: string) {
    const { customResourceProvider } = this.createFunctionIngestAfterCreation();

    new cdk.CustomResource(this, `sync-after-creation-${id}`, {
      serviceToken: customResourceProvider!.serviceToken,
      properties: {
        knowledgeBaseId: this.knowledgeBase.attrKnowledgeBaseId,
        dataSourceId: dataSourceId,
      },
    });

    // TODO start sync
    // TODO therefore we need a custom resource - maybe this is more complex than expected?
  }

  private syncDataSourceOnSchedule(
    dataSourceId: string,
    syncSchedule: CronOptions
  ) {
    const createFunctionToStartIngestionJob =
      this.createFunctionToStartIngestionJob();
    const rule = new events.Rule(this, "cron-job", {
      schedule: events.Schedule.cron(syncSchedule),
    });

    rule.addTarget(
      new targets.LambdaFunction(createFunctionToStartIngestionJob, {
        event: events.RuleTargetInput.fromObject({
          knowledgeBaseId: this.knowledgeBase.attrKnowledgeBaseId,
          dataSourceId: dataSourceId,
        }),
      })
    );
  }
}
