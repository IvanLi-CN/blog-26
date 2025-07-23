# Commit Message Rules

This document describes the commit message validation rules enforced by commitlint in this project.

## Overview

The project uses commitlint to enforce consistent commit message formatting and language requirements. All commit messages must follow the conventional commits format and be written in English only.

## Rules

### 1. Conventional Commits Format

All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Allowed Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools
- `ci`: Changes to CI configuration files and scripts
- `build`: Changes that affect the build system or external dependencies
- `revert`: Reverts a previous commit

### 2. English-Only Requirement

**All commit messages must be written in English only.** Chinese characters and other non-English characters are not allowed in:

- Subject line
- Body text
- Footer text

#### Examples

✅ **Valid commits:**
```
feat: add user authentication
fix: resolve login redirect issue
docs: update API documentation
```

❌ **Invalid commits:**
```
feat: 添加用户认证
fix: 修复登录重定向问题
docs: 更新API文档
```

### 3. Additional Format Rules

- **Subject case**: Must be lowercase (no sentence-case, start-case, pascal-case, or upper-case)
- **Subject length**: Maximum 72 characters
- **Subject ending**: Must not end with a period (.)
- **Body**: Should not be empty (warning only)
- **Body line length**: Maximum 100 characters per line
- **Body leading blank**: Must have a blank line between subject and body

## Configuration

The rules are defined in `commitlint.config.cjs` and enforced through:

1. **Lefthook pre-commit hook**: Runs automatically on every commit
2. **Manual validation**: Can be run with `bunx commitlint`

## Testing Commit Messages

You can test commit messages manually:

```bash
# Test a valid English commit
echo "feat: add new feature" | bunx commitlint

# Test an invalid Chinese commit (will fail)
echo "feat: 添加新功能" | bunx commitlint
```

## Bypassing Rules (Emergency Only)

In emergency situations, you can bypass the hooks:

```bash
# Skip all hooks (not recommended)
git commit --no-verify -m "emergency fix"

# Or set environment variable
LEFTHOOK=0 git commit -m "emergency fix"
```

**Note:** Bypassing rules should only be used in genuine emergencies and the commit should be amended later to follow the proper format.

## Error Messages

When a commit message violates the rules, you'll see specific error messages:

- `Subject must be in English only. Chinese characters are not allowed.`
- `Body must be in English only. Chinese characters are not allowed.`
- Standard conventional commits validation errors

## Benefits

This enforcement ensures:

1. **Consistency**: All commit messages follow the same format
2. **Internationalization**: English-only messages are accessible to all team members
3. **Automation**: Commit messages can be reliably parsed by tools
4. **Documentation**: Clear history of changes in a standardized format
