CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id VARCHAR(255) NOT NULL,
    platform VARCHAR(50),
    app_version VARCHAR(50),
    device_name VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_devices_installation_id UNIQUE (installation_id)
);

CREATE INDEX IF NOT EXISTS idx_devices_installation_id ON devices (installation_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices (status);
