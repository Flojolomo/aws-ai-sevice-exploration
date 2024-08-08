import * as bedrock from "aws-cdk-lib/aws-bedrock";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export type ChunkingConfiguration =
  | {
      chunkingStrategy: "NONE";
    }
  | {
      chunkingStrategy: "HIERARCHICAL" | "SEMANTIC";
      fixedSizeChunkingConfiguration?: {
        maxTokens: number;
        overlapPercentage: number;
      };
    }
  | {
      chunkingStrategy: "FIXED_SIZE";
      fixedSizeChunkingConfiguration: {
        maxTokens: number;
        overlapPercentage: number;
      };
    };

export interface KnowledgeBaseDataSourceProps {
  name: string;
  bucket: s3.IBucket;
  dataDeletionPolicy?: "DELETE" | "RETAIN";
  chunkingConfiguration?: ChunkingConfiguration;
  description?: string;
  inclusionPrefixes?: string[];
  knowledgeBase: bedrock.CfnKnowledgeBase;
}

export class KnowledgeBaseDataSource extends bedrock.CfnDataSource {
  public constructor(
    scope: Construct,
    id: string,
    props: KnowledgeBaseDataSourceProps
  ) {
    super(scope, id, {
      description: props.description,
      name: props.name,
      knowledgeBaseId: props.knowledgeBase.ref,
      dataDeletionPolicy: props.dataDeletionPolicy ?? "DELETE",
      dataSourceConfiguration: {
        type: "S3",
        s3Configuration: {
          bucketArn: props.bucket.bucketArn,
          inclusionPrefixes: props.inclusionPrefixes,
        },
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: props.chunkingConfiguration ?? {
          chunkingStrategy: "NONE",
        },
      },
    });
  }
}
