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

interface KnowledgeBaseDataSourceProps {
  name: string;
  bucket: s3.IBucket;
  chunkingConfiguration?: ChunkingConfiguration;
  description?: string;
  inclusionPrefixes?: string[];
  kmsKeyArn?: string;
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
      dataDeletionPolicy: "RETAIN",
      dataSourceConfiguration: {
        type: "S3",
        s3Configuration: {
          bucketArn: props.bucket.bucketArn,
          inclusionPrefixes: props.inclusionPrefixes,
        },
      },
      serverSideEncryptionConfiguration: {
        kmsKeyArn: props.kmsKeyArn,
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: props.chunkingConfiguration ?? {
          chunkingStrategy: "NONE",
        },
      },
    });
  }
}
