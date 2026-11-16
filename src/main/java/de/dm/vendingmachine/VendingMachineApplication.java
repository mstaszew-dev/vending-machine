package de.dm.vendingmachine;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Entry point of the backend. {@code @ConfigurationPropertiesScan} picks up
 * {@link de.dm.vendingmachine.config.MachineProperties} from application.yml.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class VendingMachineApplication {

    public static void main(String[] args) {
        SpringApplication.run(VendingMachineApplication.class, args);
    }
}
