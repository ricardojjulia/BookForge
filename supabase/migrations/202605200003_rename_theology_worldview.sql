-- Rename critic lens key from theology_worldview → contemporary_view
-- Updates existing coherence_reports rows so report_type lookups continue to work.

UPDATE public.coherence_reports
SET report_type = 'critic:contemporary_view'
WHERE report_type = 'critic:theology_worldview';

UPDATE public.coherence_reports
SET report_type = 'critic_post:contemporary_view'
WHERE report_type = 'critic_post:theology_worldview';
