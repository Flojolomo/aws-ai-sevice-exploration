import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { TextProcessing } from "./constructs/text-processing";
import { Rag } from "./constructs/rag";
import { SelfDestruct } from "cdk-self-destruct";
import { VectorStore } from "./constructs/vector-store";
import { KnowledgeBase } from "./constructs/knowledge-base";
import * as iam from "aws-cdk-lib/aws-iam";
import { FoundationModel } from "aws-cdk-lib/aws-bedrock";

export class AiDemoCasesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const embeddingModel = FoundationModel.fromFoundationModelId(
      this,
      "embedding-model",
      {
        modelId: "cohere.embed-english-v3",
      }
    );

    const s3Bucket = new cdk.aws_s3.Bucket(this, "s3-bucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const vectorStore = new VectorStore(this, "vector-store", {
      deleteOldIndices: false,
      name: "demo-example",
    });

    vectorStore.grantRead(new iam.AccountPrincipal(cdk.Stack.of(this).account));

    const knowledge = new KnowledgeBase(this, "knowledge-base", {
      embeddingModel,
      vectorDimension: 1024,
      vectorStore,
      sourceBucket: s3Bucket,
      syncAfterCreation: true,
    });

    knowledge.addDataSource("nr-four", {
      syncSchedule: { hour: "/2" },
      syncAfterCreation: true,
      chunkingConfiguration: {
        chunkingStrategy: "FIXED_SIZE",
        fixedSizeChunkingConfiguration: {
          maxTokens: 100,
          overlapPercentage: 10,
        },
      },
    });

    const titanEmbedding = FoundationModel.fromFoundationModelId(
      this,
      "embedding-model-2",
      {
        modelId: "amazon.titan-embed-text-v1",
      }
    );
    new KnowledgeBase(this, "titan-embedding-knowledge-base", {
      embeddingModel: titanEmbedding,
      vectorDimension: 1536,
      vectorStore,
      sourceBucket: s3Bucket,
    });

    new SelfDestruct(this, "SelfDestruct", {
      defaultBehavior: {
        destoryAllResources: true,
        purgeResourceDependencies: true,
      },
      trigger: {
        scheduled: {
          afterDuration: cdk.Duration.hours(4),
          enabled: true,
        },
      },
    });
  }
}
