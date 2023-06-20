import { $ } from "execa";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import sshpk from "sshpk";
import { join } from "path";
import { env } from "../index.js";

type PollingType = {
  maxRetries?: number;
  interval?: number;
  cb?: () => Promise<boolean>;
};

export const polling = async ({
  maxRetries = 30,
  interval = 5,
  cb,
}: PollingType) => {
  let result = true;
  let retires = 0;

  const callAgain = () =>
    maxRetries === retires
      ? cb?.()
          .then((res) => {
            console.log("polling successfully ✅ ");
            return res;
          })
          .catch((e) => {
            throw e;
          })
      : cb?.().catch((e) => {
          console.error(JSON.stringify(e));
        });
  while (!(await callAgain())) {
    retires++;
    if (retires >= maxRetries) {
      result = false;
      break;
    }
    await new Promise((res) => setTimeout(res, (interval + retires) * 1000));
  }
  return result;
};

export const sleep = (timeout = 2) => {
  console.log(`sleep for ${timeout}s`);
  return new Promise((res) =>
    setTimeout(() => {
      res("");
    }, 1000 * timeout)
  );
};

export const createPrivateKeyFile = (
  privateKey: string,
  filePath: string,
  fileName: string
): string => {
  const privateFilePath = join(filePath, fileName);

  createPrivateKey(privateFilePath);
  try {
    if (privateFilePath && createDir(filePath)) {
      const cleanedPrivateKey = sshpk.parsePrivateKey(privateKey);
      writeFileSync(privateFilePath, cleanedPrivateKey.toString("ssh-private"));

      chmodSync(privateFilePath, 0o600);
      isValidSSH(privateFilePath);
      return privateFilePath;
    }
    throw new Error(`filepath is required ${filePath}`);
  } catch (error) {
    throw new Error("FAILED_SAVE_PRIVATE: failed to create private key file", {
      cause: error,
    });
  }
};

const isValidSSH = (filePath: string) => {
  return $.sync` ssh-keygen -y -f ${filePath}`;
};

const createDir = (filePath: string) => {
  try {
    if (!existsSync(filePath)) {
      mkdirSync(filePath, { recursive: true });
    }
    return true;
  } catch (_) {
    throw new Error("DIR_CREATION: failed to create dir");
  }
};

const createPrivateKey = (filePath: string) => {
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
};
