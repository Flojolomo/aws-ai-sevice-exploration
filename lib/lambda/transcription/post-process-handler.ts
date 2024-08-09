import { PutObjectCommandInput, S3 } from "@aws-sdk/client-s3";

import { S3Event, S3EventRecord } from "aws-lambda";
import * as path from "path";

const s3Client = new S3();

export const handler = async (event: S3Event) => {
  console.info("Start event processing", { event });

  const postProcessedJobs = await Promise.allSettled(
    event.Records.map(processFileRecord)
  );

  postProcessedJobs.forEach((job) => {
    console.info("Postprocessing of transcription done", { job });
  });

  return;
};

async function processFileRecord(record: S3EventRecord): Promise<void> {
  console.debug("Postprocessing transcription job", { record });

  if (path.extname(record.s3.object.key) !== ".json") {
    console.warn("Abort processing. Received invalid file extension");
    return;
  }

  const transcripts = await readFileTranscripts({
    bucketName: record.s3.bucket.name,
    objectKey: record.s3.object.key,
  });

  await writeTranscriptsToTargets({
    transcripts,
    sourceObjectName: path.basename(record.s3.object.key),
  });
}

async function readFileTranscripts({
  bucketName,
  objectKey,
}: {
  bucketName: string;
  objectKey: string;
}): Promise<Array<string>> {
  const getObjectProps = {
    Bucket: bucketName,
    Key: objectKey,
  };

  console.info("Reading object from S3 bucket", { getObjectProps });
  const object = await s3Client.getObject(getObjectProps);
  const body = await object.Body?.transformToString("utf-8");

  if (!body) {
    console.warn("Empty transcription job", { bucketName, objectKey, body });
    return [];
  }

  const transcripts = JSON.parse(body).results?.transcripts;
  console.debug("Read object body", {
    body,
    key: getObjectProps.Key,
    transcripts,
  });

  return transcripts?.map((entry: any) => entry.transcript) ?? [];
}

async function writeTranscriptsToTargets({
  sourceObjectName,
  transcripts,
}: {
  sourceObjectName: string;
  transcripts: Array<string>;
}) {
  const targetObjectName = sourceObjectName.replace(
    path.extname(sourceObjectName),
    ".txt"
  );

  for (const transcript of transcripts) {
    await writeFileTranscript({
      objectKey: targetObjectName,
      prefix: process.env.TRANSCRIPTION_TEXT_OUTPUT_PREFIX!,
      transcript,
    });
  }
}

async function writeFileTranscript({
  objectKey,
  prefix,
  transcript,
}: {
  objectKey: string;
  prefix: string;
  transcript: string;
}) {
  const putObjectParams: PutObjectCommandInput = {
    Bucket: process.env.TRANSCRIPTION_TEXT_OUTPUT_BUCKET!,
    Key: `${prefix}${objectKey.replace(path.extname(objectKey), ".txt")}`,
    Body: transcript,
  };

  console.info(`Rewriting transcript text`, {
    transcript,
    putObjectParams,
  });

  try {
    await s3Client.putObject(putObjectParams);
    console.debug("Transcription written.");
  } catch (error: unknown) {
    console.error("Failed to write transcription", { error });
  }
}
