import { S3Event, S3EventRecord, SNSEvent, SNSEventRecord } from "aws-lambda";
import path = require("path");
import { getFileSize, readFileFromS3, writeFileToS3 } from "./s3Client";
import { translateText } from "./translateClient";

export const handler = async (event: S3Event) => {
  console.info("Start processing sns event", { event });

  const translationJobs = await Promise.allSettled(
    event.Records.map(processS3EventRecord)
  );

  console.info("Translation jobs started", { translationJobs });
  return;
};

async function processS3EventRecord(record: S3EventRecord) {
  console.debug("Processing S3 event record", { record });
  await translateFile({
    bucketName: record.s3.bucket.name,
    key: record.s3.object.key,
  });
}

async function translateSmallText({
  bucketName,
  key,
}: {
  bucketName: string;
  key: string;
}) {
  console.info("Translating small text", { bucketName, key });
  const transcriptionContent = await readFileFromS3({
    bucketName,
    objectKey: key,
  });

  const targetLanguages = JSON.parse(process.env.TARGET_LANGUAGES!);
  await Promise.allSettled(
    targetLanguages.map(async (language: string) => {
      const translatedText = await translateText(
        transcriptionContent!,
        language
      );

      const targetKey = `${process.env
        .TRANSLATION_OUTPUT_PREFIX!}${path.basename(
        key,
        ".txt"
      )}/${language}.txt`;
      return await writeFileToS3({
        bucketName: process.env.TRANSLATION_OUTPUT_BUCKET!,
        key: targetKey,
        body: translatedText!,
      });
    })
  );
}

async function translateFile({
  bucketName,
  key,
}: {
  bucketName: string;
  key: string;
}) {
  const fileSize = await getFileSize({ bucketName, objectKey: key });
  if (!fileSize) {
    console.error("File is not found. Aborting...", { bucketName, key });
    return;
  }

  if (fileSize < 80000) {
    return {
      fileSize,
      result: await translateSmallText({ bucketName, key }),
    };
  }

  console.error("File is too large. Aborting...", { fileSize });

  return {
    fileSize,
  };
}
