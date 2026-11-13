package de.dm.vendingmachine.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Swagger UI metadata, available at /swagger-ui.html. */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI vendingMachineOpenApi() {
        return new OpenAPI().info(new Info()
                .title("dm vending machine API")
                .version("1.0.0")
                .description("Insert coins, pick products, pay - and refill the machine as staff."));
    }
}
