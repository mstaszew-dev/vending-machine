package de.dm.vendingmachine.api;

// Excerpt from src/test/java/de/dm/vendingmachine/api/MachineApiTest.java.
// Omitted: the class-level annotations (@SpringBootTest, @AutoConfigureMockMvc,
// @DirtiesContext), the MockMvc field and 13 further tests.

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

class MachineApiTestExcerpt {

    @Test
    @DisplayName("paying returns the change and the machine keeps the purchased units out of stock")
    void purchaseReturnsTotalAndChange() throws Exception {
        insertCredit("2.00");

        mockMvc.perform(post("/api/machine/purchase")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"items": [{"productId": 1, "quantity": 2}]}
                                """))
                .andExpect(status().isOk())
                .andExpect(content().json("""
                        {"total": 1.10, "change": 0.90, "remainingCredit": 0.00}
                        """));

        mockMvc.perform(get("/api/machine"))
                .andExpect(status().isOk())
                .andExpect(content().json("""
                        {"credit": 0.00}
                        """))
                .andExpect(jsonPath("$.products[0].stock").value(1))
                .andExpect(jsonPath("$.products[0].unitsSold").value(2));
    }

    @Test
    void buyingMoreUnitsThanInStockIsRejectedAndChangesNothing() throws Exception {
        insertCredit("2.00");

        mockMvc.perform(post("/api/machine/purchase")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"items": [{"productId": 1, "quantity": 4}]}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INSUFFICIENT_STOCK"));

        mockMvc.perform(get("/api/machine"))
                .andExpect(content().json("""
                        {"credit": 2.00}
                        """))
                .andExpect(jsonPath("$.products[0].stock").value(3))
                .andExpect(jsonPath("$.products[0].unitsSold").value(0));
    }

    @Test
    @DisplayName("absurd quantities are rejected instead of overflowing stock or money")
    void absurdQuantitiesAreRejectedWithoutTouchingTheMachine() throws Exception {
        insertCredit("2.00");

        mockMvc.perform(post("/api/machine/purchase")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"items": [{"productId": 1, "quantity": 2000000000},
                                           {"productId": 1, "quantity": 2000000000}]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_QUANTITY"));

        mockMvc.perform(get("/api/machine"))
                .andExpect(content().json("""
                        {"credit": 2.00, "totalRevenue": 0.00}
                        """))
                .andExpect(jsonPath("$.products[0].stock").value(3))
                .andExpect(jsonPath("$.products[0].unitsSold").value(0));
    }

    private void insertCredit(String amount) throws Exception {
        mockMvc.perform(post("/api/machine/credit")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\": " + amount + "}"))
                .andExpect(status().isOk());
    }

}
