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
        limit  = 60
        period = 60
      }
    }
  ]
}

resource "cloudflare_workers_script_subdomain" "narrative_ai" {
  account_id       = var.cloudflare_account_id
  script_name      = var.worker_name
  enabled          = true
  previews_enabled = false

  depends_on = [cloudflare_workers_script.narrative_ai]
}

# Deliberadamente NO declaramos CHESS_AI_SHARED_SECRET como secret_text.
# Aunque Terraform lo marque sensitive, su valor acabaría almacenado en state.
# GitHub Actions lo instala tras terraform apply con `wrangler secret put`.
