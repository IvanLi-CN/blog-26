// Custom commitlint configuration with English-only rules

// Custom plugin with English-only rules
const englishOnlyPlugin = {
  rules: {
    'subject-english-only': (parsed) => {
      const { subject } = parsed;
      if (!subject) return [true];

      // Check for Chinese characters (CJK Unified Ideographs)
      const chineseRegex = /[\u4e00-\u9fff]/;
      if (chineseRegex.test(subject)) {
        return [false, 'Subject must be in English only. Chinese characters are not allowed.'];
      }

      return [true];
    },

    'body-english-only': (parsed) => {
      const { body } = parsed;
      if (!body) return [true];

      // Check for Chinese characters (CJK Unified Ideographs)
      const chineseRegex = /[\u4e00-\u9fff]/;
      if (chineseRegex.test(body)) {
        return [false, 'Body must be in English only. Chinese characters are not allowed.'];
      }

      return [true];
    },
  },
};

module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [englishOnlyPlugin],

  rules: {
    // Type rules
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'ci', 'build', 'revert'],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],

    // Scope rules
    'scope-case': [2, 'always', 'lower-case'],

    // Subject rules
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'subject-english-only': [2, 'always'],

    // Header rules
    'header-max-length': [2, 'always', 72],

    // Body rules
    'body-empty': [1, 'never'],
    'body-leading-blank': [2, 'always'],
    'body-max-line-length': [2, 'always', 100],
    'body-english-only': [2, 'always'],

    // Footer rules
    'footer-leading-blank': [1, 'always'],
    'footer-max-line-length': [2, 'always', 100],
  },
};
