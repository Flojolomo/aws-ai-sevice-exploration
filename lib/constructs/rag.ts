import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";

import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { VectorStore } from "./vector-store";
import { KnowledgeBase } from "./knowledge-base";

export class Rag extends cdk.NestedStack {
  public constructor(scope: Construct, id: string) {
    super(scope, id);

    const sourceDataBucket = this.createDataSourceBucket();
    const name = "demo-example";
    // TODO move to separate stack
    const vectorStore = new VectorStore(this, "vector-store", {
      deleteOldIndices: false,
      embeddingModelId: "cohere.embed-english-v3",
      indexName: "eighth-index",
      name,
    });

    const role = new iam.Role(this, "knowledge-base-role", {
      assumedBy: new iam.ServicePrincipal("bedrock.amazonaws.com"),
    });

    // This need to be done before rolling out the knowledge base
    vectorStore.grantReadWrite(role);

    // const knowledgeBase = new KnowledgeBase(this, "knowledge-base", {
    //   ...vectorStore,
    //   serviceRole: role,
    //   sourceBucket: sourceDataBucket,
    // });

    // knowledgeBase.addDataSource("dummy");
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
}
