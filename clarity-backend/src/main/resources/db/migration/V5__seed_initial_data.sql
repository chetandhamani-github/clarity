-- Seed initial App Configuration
INSERT INTO app_config (id, min_version, latest_version, maintenance_mode, updated_at)
VALUES (gen_random_uuid(), '1.0.0', '1.0.0', FALSE, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- Seed Feature Flags
INSERT INTO feature_flags (id, key, enabled, description, updated_at)
VALUES
    (gen_random_uuid(), 'subscription_manager', TRUE, 'Subscription tracking and recurring expenses', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'bills_reminders', TRUE, 'Bill payment reminders and notifications', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'splitwise', FALSE, 'Splitwise group expense sync', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'premium', FALSE, 'Clarity Pro and premium subscription features', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'ai_insights', FALSE, 'AI-driven financial insights and forecasting', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;

-- Seed Welcome Announcement
INSERT INTO announcements (id, title, message, active, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'Welcome to Clarity',
    'Clarity keeps all your personal financial data completely private and on-device. Explore features, track expenses, and manage budgets seamlessly!',
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT DO NOTHING;
