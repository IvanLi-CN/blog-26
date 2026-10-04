const tagger = {
  name: "github-actions[bot]",
  email: "41898282+github-actions[bot]@users.noreply.github.com",
};

async function readTagTarget(github, owner, repo, tag) {
  try {
    const { data: reference } = await github.rest.git.getRef({
      owner,
      repo,
      ref: `tags/${tag}`,
    });

    if (reference.object.type === "tag") {
      const { data: annotatedTag } = await github.rest.git.getTag({
        owner,
        repo,
        tag_sha: reference.object.sha,
      });
      return annotatedTag.object.sha;
    }

    return reference.object.sha;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function createOrVerifyTag({ github, core, owner, repo, tag, targetSha }) {
  const existingTarget = await readTagTarget(github, owner, repo, tag);
  if (existingTarget) {
    if (existingTarget !== targetSha) {
      throw new Error(`Release tag ${tag} points to ${existingTarget}, expected ${targetSha}`);
    }
    core.info(`Release tag ${tag} already points to ${targetSha}; skipping creation.`);
    return;
  }

  const { data: annotatedTag } = await github.rest.git.createTag({
    owner,
    repo,
    tag,
    message: tag,
    object: targetSha,
    type: "commit",
    tagger: { ...tagger, date: new Date().toISOString() },
  });

  try {
    await github.rest.git.createRef({
      owner,
      repo,
      ref: `refs/tags/${tag}`,
      sha: annotatedTag.sha,
    });
    core.info(`Created release tag ${tag} at ${targetSha}.`);
  } catch (error) {
    if (error.status !== 422) throw error;

    const racedTarget = await readTagTarget(github, owner, repo, tag);
    if (racedTarget !== targetSha) throw error;
    core.info(`Release tag ${tag} was created concurrently at ${targetSha}.`);
  }
}

module.exports = { createOrVerifyTag };
