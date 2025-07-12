# Requirements for URL Shortening Service

## Background & Overview

Years ago I used to use a menubar app called CloudApp to quickly take a URL and shorten it to https://c.danny.is/some-url. I would like to have similar functionality now, but using a cheaper service which I own entirely.

I need a URL shortnener which will redirect https://dny.li/<slug> to the URL as fast as possible.

## Core Functionality

For each URL, at least the following should be stored. Structure is only a suggestion:

```json
"url": "https://example.com/very-long-url",
"slug": "short-path",
"created": "2025-01-10T12:00:00Z",
"updated": "2025-02-09T12:00:00Z",
"metadata": {
  "title": "The pages og:title or title",
  "description": "The pages description",
  "image": "https://example.com/og-image.jpg"
}
```

If a slug is not provided by me, they should be generated as unique, random readable kebab-case strings which are as short as possible (eg. "apple-cupboard"). I will usually provide a custom slug.

## The Redirects

- Short links must work instantly after creation
- Once created, short links should never expire or break
- The redirects should be as FAST as possible. This probably means using cloudflare workers or similar.
- The redrects must be SEO-friendly.
- Ideally, if the shortened URL is embedded in a tool like Slack, Notion, Twitter, Facebook etc... the title, description, OG image and other OG data should be passed though to allow rich previews. If this is not possible via HTTP redirects, we may have to provide HTML redirects. I don;t know if these kinds of tools follow HTTP redirects for rich embedding?

## Admin Panel & Admin API

I should be able to access a simple Admin web interface which allows me to quickly

- Create new shortURLs with custom slugs
- Edit existing shortURLs' details.
- Delete shortURLs.
- (optionally) See the number of times users have used the redirects.

This should work well on desktop and mobile.

The above fincationality should also be available via an authenticated HTTP API so I can create, edit and delete shortURLs programatically. The full list of shortURLs & their details should be available on an unauthenticated JSON endpoint.

## Backups

The full list of redirects should be backed up regularly to a static file on github (probably via a simple github action?).

## Security & Authentication

- Only I will use the admin features. Other people must not be able to use admin features.
- Block creation/editing for URLs like: localhost, private IPs (192.168., 10., 172.16-31.\*), javascript:, data:, and other dangerous protocols.
- Rate limit admin actions (on both web and API) in case of hacks/attacks
- Rate limit people following redirects as appropriate to stay under free usagelimits

## Performance

- Fast redirect time globally
- Low page-load time for admin interface
- 99.9% uptime for redirects. Can be slightly less for admin features.

## Cost Constraints

- Must Remain Free: Stay within free tier limits for any tools/services used
- Minimal External Services: Avoid any paid APIs or services
- Resource Efficiency: Optimize for minimal compute/KV operations etc

## Maintainance Requirements

- Must be simple and reliable. The less code the better.
- Should have as few external dependencies as possible.
- Should need near-zero maintainance for me.
- Ideally, should still work in ~10 years without any maintainance from me.

## Suggested Technologies

These are just suggestions...

- Cloudflare Workers
- Cloudflare KV Storage
- GitHub Actions (for backup)

## Preferred Programming Languages

- Typescript and other web-native languages unless these is a very good reason
