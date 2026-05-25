-- Account-deletion erasure cascade (pre-fork hardening, step 2).
-- Personal data (conversations, workflow executions, user memory, evaluations,
-- webhook subscriptions) -> ON DELETE CASCADE: erased with the user.
-- Org config + audit (agents, profiles, workflows, providers, knowledge docs, MCP,
-- admin audit log) -> ON DELETE SET NULL with the creator/uploader made nullable:
-- retained and de-attributed when their creator is deleted.
-- AiConversation.userId / AiWorkflowExecution.userId are nullable (still CASCADE) so
-- schedule/inbound-triggered runs can be system-owned (null user).
-- Children (messages, embeddings, steps, deliveries) already cascade from these roots.

-- DropForeignKey
ALTER TABLE "ai_agent" DROP CONSTRAINT "ai_agent_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ai_agent_profile" DROP CONSTRAINT "ai_agent_profile_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ai_agent_invite_token" DROP CONSTRAINT "ai_agent_invite_token_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ai_agent_version" DROP CONSTRAINT "ai_agent_version_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ai_agent_embed_token" DROP CONSTRAINT "ai_agent_embed_token_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ai_workflow" DROP CONSTRAINT "ai_workflow_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ai_workflow_version" DROP CONSTRAINT "ai_workflow_version_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ai_workflow_schedule" DROP CONSTRAINT "ai_workflow_schedule_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ai_workflow_trigger" DROP CONSTRAINT "ai_workflow_trigger_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ai_workflow_execution" DROP CONSTRAINT "ai_workflow_execution_userId_fkey";

-- DropForeignKey
ALTER TABLE "ai_conversation" DROP CONSTRAINT "ai_conversation_userId_fkey";

-- DropForeignKey
ALTER TABLE "ai_event_hook" DROP CONSTRAINT "ai_event_hook_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ai_user_memory" DROP CONSTRAINT "ai_user_memory_userId_fkey";

-- DropForeignKey
ALTER TABLE "ai_knowledge_document" DROP CONSTRAINT "ai_knowledge_document_uploadedBy_fkey";

-- DropForeignKey
ALTER TABLE "ai_evaluation_session" DROP CONSTRAINT "ai_evaluation_session_userId_fkey";

-- DropForeignKey
ALTER TABLE "ai_webhook_subscription" DROP CONSTRAINT "ai_webhook_subscription_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ai_provider_config" DROP CONSTRAINT "ai_provider_config_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ai_provider_model" DROP CONSTRAINT "ai_provider_model_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ai_admin_audit_log" DROP CONSTRAINT "ai_admin_audit_log_userId_fkey";

-- DropForeignKey
ALTER TABLE "ai_experiment" DROP CONSTRAINT "ai_experiment_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "mcp_exposed_prompt" DROP CONSTRAINT "mcp_exposed_prompt_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "mcp_api_key" DROP CONSTRAINT "mcp_api_key_createdBy_fkey";

-- AlterTable
ALTER TABLE "ai_agent" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_agent_profile" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_agent_invite_token" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_agent_version" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_agent_embed_token" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_workflow" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_workflow_version" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_workflow_schedule" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_workflow_trigger" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_workflow_execution" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_conversation" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_event_hook" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_knowledge_document" ALTER COLUMN "uploadedBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_provider_config" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_provider_model" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_admin_audit_log" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_experiment" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "mcp_exposed_prompt" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "mcp_api_key" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ai_agent" ADD CONSTRAINT "ai_agent_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_profile" ADD CONSTRAINT "ai_agent_profile_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_invite_token" ADD CONSTRAINT "ai_agent_invite_token_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_version" ADD CONSTRAINT "ai_agent_version_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_embed_token" ADD CONSTRAINT "ai_agent_embed_token_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_workflow" ADD CONSTRAINT "ai_workflow_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_workflow_version" ADD CONSTRAINT "ai_workflow_version_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_workflow_schedule" ADD CONSTRAINT "ai_workflow_schedule_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_workflow_trigger" ADD CONSTRAINT "ai_workflow_trigger_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_workflow_execution" ADD CONSTRAINT "ai_workflow_execution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_event_hook" ADD CONSTRAINT "ai_event_hook_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_user_memory" ADD CONSTRAINT "ai_user_memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_knowledge_document" ADD CONSTRAINT "ai_knowledge_document_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_evaluation_session" ADD CONSTRAINT "ai_evaluation_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_webhook_subscription" ADD CONSTRAINT "ai_webhook_subscription_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_provider_config" ADD CONSTRAINT "ai_provider_config_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_provider_model" ADD CONSTRAINT "ai_provider_model_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_admin_audit_log" ADD CONSTRAINT "ai_admin_audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_experiment" ADD CONSTRAINT "ai_experiment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_exposed_prompt" ADD CONSTRAINT "mcp_exposed_prompt_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_api_key" ADD CONSTRAINT "mcp_api_key_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

