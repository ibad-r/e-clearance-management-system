ALTER TYPE "public"."clearance_request_status" ADD VALUE 'PENDING_HR_VERIFICATION' BEFORE 'IN_PROGRESS';--> statement-breakpoint
ALTER TABLE "clearance_requests" ALTER COLUMN "template_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD COLUMN "questionnaire_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD COLUMN "department_recommendation_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD COLUMN "hr_verified_by_id" uuid;--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD COLUMN "hr_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD COLUMN "selection_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD CONSTRAINT "clearance_requests_hr_verified_by_id_users_id_fk" FOREIGN KEY ("hr_verified_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD CONSTRAINT "clearance_requests_selection_revision_check" CHECK ("clearance_requests"."selection_revision" >= 0);--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD CONSTRAINT "clearance_requests_hr_metadata_check" CHECK ((
        "clearance_requests"."hr_verified_by_id" is null
        and "clearance_requests"."hr_verified_at" is null
        and "clearance_requests"."selection_revision" = 0
      ) or (
        "clearance_requests"."hr_verified_by_id" is not null
        and "clearance_requests"."hr_verified_at" is not null
        and "clearance_requests"."selection_revision" > 0
      ));--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD CONSTRAINT "clearance_requests_questionnaire_object_check" CHECK ("clearance_requests"."questionnaire_snapshot" is null
        or jsonb_typeof("clearance_requests"."questionnaire_snapshot") = 'object');--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD CONSTRAINT "clearance_requests_recommendation_object_check" CHECK ("clearance_requests"."department_recommendation_snapshot" is null
        or jsonb_typeof("clearance_requests"."department_recommendation_snapshot") = 'object');--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD CONSTRAINT "clearance_requests_pending_hr_check" CHECK ("clearance_requests"."status"::text <> 'PENDING_HR_VERIFICATION'
        or (
          "clearance_requests"."template_id" is null
          and "clearance_requests"."questionnaire_snapshot" is not null
          and "clearance_requests"."department_recommendation_snapshot" is not null
          and "clearance_requests"."submitted_at" is not null
          and "clearance_requests"."hr_verified_by_id" is null
          and "clearance_requests"."hr_verified_at" is null
          and "clearance_requests"."selection_revision" = 0
        ));--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD CONSTRAINT "clearance_requests_template_lifecycle_check" CHECK ((
        "clearance_requests"."questionnaire_snapshot" is null
        and "clearance_requests"."department_recommendation_snapshot" is null
        and "clearance_requests"."template_id" is not null
        and "clearance_requests"."hr_verified_at" is null
      ) or (
        "clearance_requests"."questionnaire_snapshot" is not null
        and "clearance_requests"."department_recommendation_snapshot" is not null
        and (
          (
            "clearance_requests"."template_id" is null
            and "clearance_requests"."hr_verified_at" is null
            and "clearance_requests"."status"::text in (
              'PENDING_HR_VERIFICATION', 'CANCELLED'
            )
          ) or (
            "clearance_requests"."template_id" is not null
            and "clearance_requests"."hr_verified_at" is not null
            and "clearance_requests"."status"::text not in (
              'PENDING_HR_VERIFICATION', 'PENDING_SUBMISSION'
            )
          )
        )
      ));