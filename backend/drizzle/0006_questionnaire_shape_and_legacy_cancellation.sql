ALTER TABLE "clearance_requests" DROP CONSTRAINT "clearance_requests_template_lifecycle_check";--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD CONSTRAINT "clearance_requests_questionnaire_shape_check" CHECK ("clearance_requests"."questionnaire_snapshot" is null or (
      "clearance_requests"."questionnaire_snapshot"->>'version' = 'v1'
      and ("clearance_requests"."questionnaire_snapshot" - array['version','answers']) = '{}'::jsonb
      and jsonb_typeof("clearance_requests"."questionnaire_snapshot"->'answers') = 'object'
      and ("clearance_requests"."questionnaire_snapshot"->'answers') ?& array[
        'hdsDepartment','financeDepartment','feesAndDuesDepartment','computerServicesDepartment',
        'operationsDepartment','cmsRepresentative','oric','storeSection','wardenHostel','labInchargeOffice',
        'informationServicesDepartment','wardInchargeNursingDivision','pharmacy','headOfDepartment']
      and (("clearance_requests"."questionnaire_snapshot"->'answers') - array[
        'hdsDepartment','financeDepartment','feesAndDuesDepartment','computerServicesDepartment',
        'operationsDepartment','cmsRepresentative','oric','storeSection','wardenHostel','labInchargeOffice',
        'informationServicesDepartment','wardInchargeNursingDivision','pharmacy','headOfDepartment']) = '{}'::jsonb
      and ("clearance_requests"."questionnaire_snapshot"->'answers'->>'hdsDepartment') in ('YES','NO','NOT_SURE') and ("clearance_requests"."questionnaire_snapshot"->'answers'->>'financeDepartment') in ('YES','NO','NOT_SURE') and ("clearance_requests"."questionnaire_snapshot"->'answers'->>'feesAndDuesDepartment') in ('YES','NO','NOT_SURE') and ("clearance_requests"."questionnaire_snapshot"->'answers'->>'computerServicesDepartment') in ('YES','NO','NOT_SURE') and ("clearance_requests"."questionnaire_snapshot"->'answers'->>'operationsDepartment') in ('YES','NO','NOT_SURE') and ("clearance_requests"."questionnaire_snapshot"->'answers'->>'cmsRepresentative') in ('YES','NO','NOT_SURE') and ("clearance_requests"."questionnaire_snapshot"->'answers'->>'oric') in ('YES','NO','NOT_SURE') and ("clearance_requests"."questionnaire_snapshot"->'answers'->>'storeSection') in ('YES','NO','NOT_SURE') and ("clearance_requests"."questionnaire_snapshot"->'answers'->>'wardenHostel') in ('YES','NO','NOT_SURE') and ("clearance_requests"."questionnaire_snapshot"->'answers'->>'labInchargeOffice') in ('YES','NO','NOT_SURE') and ("clearance_requests"."questionnaire_snapshot"->'answers'->>'informationServicesDepartment') in ('YES','NO','NOT_SURE') and ("clearance_requests"."questionnaire_snapshot"->'answers'->>'wardInchargeNursingDivision') in ('YES','NO','NOT_SURE') and ("clearance_requests"."questionnaire_snapshot"->'answers'->>'pharmacy') in ('YES','NO','NOT_SURE') and ("clearance_requests"."questionnaire_snapshot"->'answers'->>'headOfDepartment') in ('YES','NO','NOT_SURE')
    ) is true);--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD CONSTRAINT "clearance_requests_template_lifecycle_check" CHECK ((
        "clearance_requests"."questionnaire_snapshot" is null
        and "clearance_requests"."department_recommendation_snapshot" is null
        and ("clearance_requests"."template_id" is not null or "clearance_requests"."status"::text = 'CANCELLED')
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