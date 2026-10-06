import versionJson from "@/generated/version.json";

export interface VersionInfo {
  version: string;
  productVersion: string | null;
  buildVersion: string;
  sourceSha: string;
  buildDate: string;
  commitHash: string;
  commitShortHash: string;
  repositoryUrl: string;
  commitUrl: string;
  branchName: string;
  branchUrl: string | null;
}

const FALLBACK_VERSION_INFO: VersionInfo = {
  version: "dev-local",
  productVersion: null,
  buildVersion: "dev-local",
  sourceSha: "unknown",
  buildDate: "00000000",
  commitHash: "unknown",
  commitShortHash: "unknown",
  repositoryUrl: "",
  commitUrl: "",
  branchName: "dev-local",
  branchUrl: null,
};

type PartialVersionInfo = {
  [Key in keyof VersionInfo]?: VersionInfo[Key];
};

const parsedVersionInfo = versionJson as PartialVersionInfo;

export const versionInfo: VersionInfo = {
  version: parsedVersionInfo.version ?? FALLBACK_VERSION_INFO.version,
  productVersion: parsedVersionInfo.productVersion ?? FALLBACK_VERSION_INFO.productVersion,
  buildVersion:
    parsedVersionInfo.buildVersion ??
    parsedVersionInfo.version ??
    FALLBACK_VERSION_INFO.buildVersion,
  sourceSha:
    parsedVersionInfo.sourceSha ?? parsedVersionInfo.commitHash ?? FALLBACK_VERSION_INFO.sourceSha,
  buildDate: parsedVersionInfo.buildDate ?? FALLBACK_VERSION_INFO.buildDate,
  commitHash: parsedVersionInfo.commitHash ?? FALLBACK_VERSION_INFO.commitHash,
  commitShortHash: parsedVersionInfo.commitShortHash ?? FALLBACK_VERSION_INFO.commitShortHash,
  repositoryUrl: parsedVersionInfo.repositoryUrl ?? FALLBACK_VERSION_INFO.repositoryUrl,
  commitUrl: parsedVersionInfo.commitUrl ?? FALLBACK_VERSION_INFO.commitUrl,
  branchName: parsedVersionInfo.branchName ?? FALLBACK_VERSION_INFO.branchName,
  branchUrl:
    typeof parsedVersionInfo.branchUrl === "string" || parsedVersionInfo.branchUrl === null
      ? parsedVersionInfo.branchUrl
      : FALLBACK_VERSION_INFO.branchUrl,
};
