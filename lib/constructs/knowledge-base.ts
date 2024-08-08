import { Construct } from "constructs";
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import * as iam from "aws-cdk-lib/aws-iam";
import * as osServerless from "aws-cdk-lib/aws-opensearchserverless";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { KnowledgeBaseDataSource } from "./knowledge-base-data-source";

interface KnowledgeBaseProps {
  collection: osServerless.CfnCollection;
  embeddingModelId: string;
  vectorIndexName: string;
  serviceRole: iam.Role;
  sourceBucket?: s3.Bucket;
  fieldMapping: {
    vectorField: string;
    metadataField: string;
    textField: string;
  };
}

export class KnowledgeBase extends cdk.NestedStack {
  public readonly role: iam.Role;
  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  public readonly dataSource: bedrock.CfnDataSource;

  public constructor(scope: Construct, id: string, props: KnowledgeBaseProps) {
    super(scope, id);

    this.role = props.serviceRole;
    this.knowledgeBase = new bedrock.CfnKnowledgeBase(this, "knowledge-base", {
      name: cdk.Names.uniqueResourceName(this, {}),
      roleArn: props.serviceRole.roleArn,
      storageConfiguration: {
        opensearchServerlessConfiguration: {
          collectionArn: props.collection.attrArn,
          vectorIndexName: props.vectorIndexName,
          fieldMapping: props.fieldMapping,
        },
        type: "OPENSEARCH_SERVERLESS",
      },
      knowledgeBaseConfiguration: {
        type: "VECTOR",
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:eu-central-1::foundation-model/${props.embeddingModelId}`,
        },
      },
    });

    const sourceBucket =
      props.sourceBucket ?? new s3.Bucket(this, "source-bucket");

    sourceBucket.grantRead(this.role);

    // TODO add data sources for evaluation

    this.dataSource = new bedrock.CfnDataSource(this, "data-source", {
      name: "demo-example",
      knowledgeBaseId: this.knowledgeBase.ref,
      // Otherwise the deletion fails due to permissions issues
      dataDeletionPolicy: "RETAIN",
      dataSourceConfiguration: {
        type: "S3",
        s3Configuration: {
          bucketArn: sourceBucket.bucketArn,
        },
      },
    });

    // TODO parsing strategy
  }

  public syncDataSourceAfterCreation() {
    // TODO start sync
  }

  public syncDataSourceOnSchedule() {
    // TODO start sync
  }

  public addDataSource(id: string) {
    // TODO add data sources
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_bedrock.CfnDataSource.html

    const sourceBucket = new s3.Bucket(this, `source-bucket-${id}`, {
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    sourceBucket.grantRead(this.role);
    new KnowledgeBaseDataSource(this, `data-source-${id}`, {
      bucket: sourceBucket,
      knowledgeBase: this.knowledgeBase,
      name: "dummy",
    });
  }
}
