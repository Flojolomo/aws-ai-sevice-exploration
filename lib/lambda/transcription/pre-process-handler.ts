import { Logger } from "@aws-lambda-powertools/logger";
import {
  StartTranscriptionJobCommand,
  Transcribe,
} from "@aws-sdk/client-transcribe";

import { S3Event } from "aws-lambda";
import * as path from "path";

const transcribeClient = new Transcribe();
const logger = new Logger();
export const handler = async (event: S3Event) => {
  console.info("Start event processing", { event });

  const transcriptionJobs = await Promise.allSettled(
    event.Records.map(async (record) => {
      const fileName = path.basename(record.s3.object.key);
      const startTranscriptionCommand = new StartTranscriptionJobCommand({
        TranscriptionJobName: `${Date.now()}-${fileName}`,
        LanguageCode: "en-US",
        Media: {
          MediaFileUri: `s3://${record.s3.bucket.name}/${record.s3.object.key}`,
        },
        OutputBucketName: process.env.TRANSCRIPTION_OUTPUT_BUCKET!,
        OutputKey: `${process.env
          .TRANSCRIPTION_OUTPUT_PREFIX!}${Date.now()}-${fileName.replace(
          path.extname(fileName),
          ".json"
        )}`,
      });

      console.info("Start transcription job", { startTranscriptionCommand });
      await transcribeClient.send(startTranscriptionCommand);
    })
  );

  transcriptionJobs.forEach((job) => {
    console.info("Transcription job started", { job });
  });

  return;
};
