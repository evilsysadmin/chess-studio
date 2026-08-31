resource "cloudflare_workers_script" "narrative_ai" {
  account_id         = var.cloudflare_account_id
  script_name        = var.worker_name
  content            = file("${path.module}/worker/index.js")
  main_module        = "index.js"
  compatibility_date = var.compatibility_date
  keep_bindings      = ["secret_text"]

  bindings = [
    {
      type = "ai"
      name = "AI"
    },
    {
      type         = "ratelimit"
      name         = "AI_RATE_LIMITER"
      namespace_id = var.rate_limit_namespace_id
      simple = {
        limit  = 300
        period = 60
      }
    }
  ]
}

# Production ingress is the Custom Domain below. Keep workers.dev disabled so
# the Worker has one stable public hostname and we do not depend on the account
# workers.dev namespace/certificate path.
resource "cloudflare_workers_script_subdomain" "narrative_ai" {
  account_id       = var.cloudflare_account_id
  script_name      = var.worker_name
  enabled          = false
  previews_enabled = false

  depends_on = [cloudflare_workers_script.narrative_ai]
}

# Cloudflare Workers Custom Domains create/manage the DNS routing and TLS
# certificate for this hostname; no separate CNAME/A record is required.
resource "cloudflare_workers_custom_domain" "narrative_ai" {
  account_id = var.cloudflare_account_id
  hostname   = var.custom_domain_hostname
  service    = var.worker_name
  zone_name  = var.custom_domain_zone_name

  depends_on = [cloudflare_workers_script.narrative_ai]
}

# The production frontend DNS is intentionally owned by
# scripts/cloudflare_production_pages.py. That helper performs a two-phase
# cutover: it verifies the exact build on pages.dev before switching the public
# CNAME, which Terraform cannot express safely in one apply. Render remains
# DNS-only so its custom-domain validation sees the real target directly.
resource "cloudflare_dns_record" "render_api" {
  zone_id = var.cloudflare_zone_id
  name    = var.render_api_hostname
  type    = "CNAME"
  content = var.render_api_cname_target
  proxied = false
  ttl     = 1
  comment = "Chess Studio API · Render"
}

# Deliberadamente NO declaramos CHESS_AI_SHARED_SECRET como secret_text.
# Aunque Terraform lo marque sensitive, su valor acabaría almacenado en state.
# GitHub Actions lo instala tras terraform apply con `wrangler secret put`.
