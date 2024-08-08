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

    const vectorStore = new VectorStore(this, "vector-store", {
      deleteOldIndices: false,
      indexName: "ninth-index",
      name: "demo-example",
    });

    vectorStore.grantRead(new iam.AccountPrincipal(cdk.Stack.of(this).account));

    new KnowledgeBase(this, "knowledge-base", {
      embeddingModel,
      vectorDimension: 1024,
      vectorStore,
    });

    // knowledgeBase.addDependency(vectorStore);

    // new SelfDestruct(this, "SelfDestruct", {
    //   defaultBehavior: {
    //     destoryAllResources: true,
    //     purgeResourceDependencies: true,
    //   },
    //   trigger: {
    //     scheduled: {
    //       afterDuration: cdk.Duration.hours(4),
    //       enabled: true,
    //     },
    //   },
    // });
  }
}
