package com.clarity.common.config;

import com.clarity.common.security.ApiProtectionInterceptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Arrays;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final ObjectProvider<ApiProtectionInterceptor> apiProtectionInterceptorProvider;
    private final String[] allowedOrigins;

    public WebConfig(
            ObjectProvider<ApiProtectionInterceptor> apiProtectionInterceptorProvider,
            @Value("${clarity.cors.allowed-origins:}") String corsAllowedOrigins) {
        this.apiProtectionInterceptorProvider = apiProtectionInterceptorProvider;
        this.allowedOrigins = corsAllowedOrigins == null
                ? new String[0]
                : Arrays.stream(corsAllowedOrigins.split(","))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .toArray(String[]::new);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        var mapping = registry.addMapping("/api/**")
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("Accept", "Authorization", "Content-Type", "X-Admin-Key", "X-Idempotency-Key", "X-Installation-Id")
                .maxAge(3600);

        if (allowedOrigins.length > 0) {
            mapping.allowedOrigins(allowedOrigins).allowCredentials(true);
        } else {
            mapping.allowedOriginPatterns("http://localhost:*", "http://127.0.0.1:*").allowCredentials(false);
        }
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        ApiProtectionInterceptor interceptor = apiProtectionInterceptorProvider.getIfAvailable();
        if (interceptor != null) {
            registry.addInterceptor(interceptor)
                    .addPathPatterns("/api/v1/ai/**", "/api/v1/auth/**", "/api/v1/splitwise/**");
        }
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addRedirectViewController("/", "/admin/");
        registry.addViewController("/admin").setViewName("forward:/admin/index.html");
        registry.addViewController("/admin/").setViewName("forward:/admin/index.html");
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/admin/**")
                .addResourceLocations("classpath:/static/admin/");
    }
}
