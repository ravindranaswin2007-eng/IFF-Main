# Indianfinancialforum

Imported website: https://stitch.withgoogle.com/projects/8810253848235921543

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9046fac1-bcea-4800-a52c-04f05fc69a55).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Use Node.js 24 and npm. Run these commands from the directory containing `package.json`.

```sh
npm ci
npm run dev
```

The dev server prints its URL. Form submissions and publications are saved in the ignored `.iff-data/` directory by default. Set `IFF_LOCAL_DB` to point dev at a different directory, or set `IFF_DATABASE_URL` to use a PostgreSQL instance instead.

Set `IFF_ADMIN_PASSWORD` in the server environment before starting if you want to sign in to the CRM at `/admin`. Choose a generated password of at least 16 characters and leave the email field blank for the first sign-in. Under **Settings → Users**, create named editor or administrator accounts. Only administrators can manage users.

- **Submissions inbox** receives membership and contact enquiries, career and speaker applications, and newsletter sign-ups. Search or filter submissions, set their follow-up status, record an owner and private notes, download résumés, or export the filtered inbox to CSV.
- **Content** manages events and Knowledge Hub publications. Use the file library or a public URL for reports and recordings. Publication drafts stay private until published.
- **People** edits leadership and volunteer profiles. Visible profiles appear on About Us.
- **Library** stores approved photographs, PDFs and audio files for the public site. Each upload can be up to 20 MB. Use the enquiries inbox for private résumés.
- **Website** sets hero and closing photographs, the logo, the partner names and the partnership brochure.

The approved event photos in `public/photos/` were sourced from the [IFF photo shortlist](https://drive.google.com/drive/folders/1VwYvFv-1NnxSosQGMo0VXfr0bHy-m8DK). The volunteer section is pending the form response export and approved headshots.

## AWS deployment

The Dockerfile builds a Node server for Amazon ECS Fargate. Run `docker build -t iff .` and push the image to Amazon ECR. Configure the ECS task with container port `8080`, CloudWatch logs, and environment variables and secrets as listed below. Use an Application Load Balancer IP target group on port `8080` with `/api/iff/health` as the health check. Route HTTPS through an ACM certificate and redirect HTTP to HTTPS.

| Setting | Value |
| --- | --- |
| `IFF_PUBLIC_ORIGIN` | Public HTTPS origin, such as `https://www.example.org`, without a path. Redirect alternate hostnames to this origin. |
| `IFF_DATABASE_URL` | Secrets Manager value containing the PostgreSQL connection URL. URL-encode the password and omit SSL query options. |
| `IFF_ADMIN_PASSWORD` | Secrets Manager value containing a generated shared editor password of at least 16 characters. |
| `IFF_DATABASE_CA_FILE` | Already set in the image to the AWS RDS CA bundle. |

Create a private RDS PostgreSQL database with encryption and automated backups. The app connects over TLS with certificate verification. Give its database role ownership of the application database so it can create the IFF tables at first startup. Allow port `5432` from the ECS task security group only and allow inbound `8080` on the tasks from the load balancer only. Give the task execution role access to the referenced Secrets Manager secrets. Keep the ECS tasks private and provide outbound access for ECR, Secrets Manager and CloudWatch through NAT or VPC endpoints.

If using CloudFront, disable caching for `/admin`, `/api/iff/admin/*`, `/api/iff/submissions`, TanStack server-function requests and public HTML that shows managed content. `/api/iff/media/*` serves public library files at immutable URLs. RDS stores both the media library and submissions. Connecting a newsletter sender is a separate integration.

After deploying, verify `/api/iff/health` and the homepage return HTTP 200. Submit a test membership enquiry and verify it appears in `/admin`, then publish a draft and open it in the Knowledge Hub.

## Vercel deployment

Import the GitHub repository from its root. `vercel.json` selects the npm build, and Nitro emits the Vercel Node function and static assets during that build. The function region is Seoul, matching the IFF Supabase project. Connect a PostgreSQL database with a TLS certificate trusted by Node.js, and set `IFF_ADMIN_PASSWORD` in the Production environment. The database connection uses `IFF_DATABASE_URL`, `POSTGRES_URL`, or `DATABASE_URL`, in that order. Leave `IFF_DATABASE_CA_FILE` unset for a provider with a publicly trusted certificate. Set `IFF_DATABASE_SCHEMA` to an existing schema if sharing a PostgreSQL database. The application role needs `USAGE` and `CREATE` in that schema. If you use an explicit `IFF_PUBLIC_ORIGIN`, set it to the full HTTPS URL you want people to use for submitting forms.

Vercel uploads are limited to 4 MB per résumé or library file to fit the Function payload limit. Publications can link to externally hosted reports and recordings. After deploying, check `/api/iff/health` and verify `/admin` with the production administrator password.
