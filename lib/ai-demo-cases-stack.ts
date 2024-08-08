import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { TextProcessing } from "./constructs/text-processing";
import { Rag } from "./constructs/rag";
import { SelfDestruct } from "cdk-self-destruct";
import { VectorStore } from "./constructs/vector-store";
import { KnowledgeBase } from "./constructs/knowledge-base";
import * as iam from "aws-cdk-lib/aws-iam";

export class AiDemoCasesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // const rag = new Rag(this, "rag");

    const serviceRole = new iam.Role(this, "knowledge-base-role", {
      assumedBy: new iam.ServicePrincipal("bedrock.amazonaws.com"),
    });

    const vectorStore = new VectorStore(this, "vector-store", {
      deleteOldIndices: false,
      embeddingModelId: "cohere.embed-english-v3",
      indexName: "eighth-index",
      name: "demo-example",
      readWriteRoles: [serviceRole],
    });

    const knowledgeBase = new KnowledgeBase(this, "knowledge-base", {
      ...vectorStore,
      serviceRole: serviceRole,
    });

    // new TextProcessing(this, "text-processing");

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

    // rag.node.addDependency(selfDestruct);
  }
}
