package com.clarity.common.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI clarityOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Clarity Backend API")
                        .description("Modular Monolith Backend API for Clarity Personal Finance Application. " +
                                "Handles device registration, application configuration, dynamic feature flags, and announcements.")
                        .version("1.0.0")
                        .contact(new Contact()
                                .name("Clarity Engineering Team")
                                .email("support@clarityfinance.app"))
                        .license(new License()
                                .name("Apache 2.0")
                                .url("https://www.apache.org/licenses/LICENSE-2.0")))
                .servers(List.of(
                        new Server().url("/").description("Current Server")
                ));
    }
}
