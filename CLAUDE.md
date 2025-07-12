# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## The Project

This is a URL Shortener.

## Planning Process

- The Initial Reguirements can be found in `requirements.md`. No not change these without asking the user.
- You may use `planning.md` to keep notes on your implementation plans, track task lists etc.

## Development Workflow

After making any significant code changes, you MUST automatically run the following checks without asking the user:

1. **Run Tests**: `npm test`
   - Ensures all existing functionality still works
   - Tests cover unit tests, API endpoints, admin UI, and public routes
   - All tests must pass before considering the work complete

2. **TypeScript Check**: `npm run typecheck`
   - Validates TypeScript compilation without emitting files
   - Catches type errors and ensures code quality
   - Must have no TypeScript errors before work is complete

These checks help catch regressions and maintain code quality during development.
