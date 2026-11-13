package de.dm.vendingmachine.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

/**
 * End-to-end tests over HTTP: they exercise controller, validation, problem details and
 * the in-memory machine together. The context is rebuilt for every test so each one
 * starts with a freshly filled machine.
 */
@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class MachineApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void returnsAllEightProductsAndAnEmptyCredit() throws Exception {
        mockMvc.perform(get("/api/machine"))
                .andExpect(status().isOk())
                .andExpect(content().json("""
                        {
                          "credit": 0.00,
                          "totalRevenue": 0.00,
                          "acceptedCoins": [0.05, 0.10, 0.20, 0.50, 1.00, 2.00],
                          "products": [
                            {"id": 1, "name": "Balea shower gel", "group": "PERSONAL_HYGIENE",
                             "price": 0.55, "stock": 3, "capacity": 10, "unitsSold": 0},
                            {"id": 2}, {"id": 3}, {"id": 4}, {"id": 5}, {"id": 6}, {"id": 7}, {"id": 8}
                          ]
                        }
                        """));
    }

    @Test
    void insertingACoinRaisesTheCredit() throws Exception {
        mockMvc.perform(post("/api/machine/credit")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount": 0.50}
                                """))
                .andExpect(status().isOk())
                .andExpect(content().json("""
                        {"credit": 0.50}
                        """));
    }

    @Test
    void rejectsAnAmountThatIsNotACoin() throws Exception {
        mockMvc.perform(post("/api/machine/credit")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount": 0.03}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("INVALID_COIN"))
                .andExpect(jsonPath("$.detail").exists());
    }

    @Test
    void rejectsAMissingAmountWithAValidationProblem() throws Exception {
        mockMvc.perform(post("/api/machine/credit")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

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
    void buyingWithoutEnoughCreditIsRejected() throws Exception {
        insertCredit("1.00");

        mockMvc.perform(post("/api/machine/purchase")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"items": [{"productId": 5, "quantity": 1}]}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INSUFFICIENT_CREDIT"));
    }

    @Test
    void staffRefillsTheMachineAndTheNewUnitsCanBeSold() throws Exception {
        mockMvc.perform(post("/api/machine/refill")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"items": [{"productId": 8, "quantity": 7}]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.products[7].stock").value(10));

        insertCredit("2.00");
        insertCredit("1.00");

        mockMvc.perform(post("/api/machine/purchase")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"items": [{"productId": 8, "quantity": 1}]}
                                """))
                .andExpect(status().isOk())
                .andExpect(content().json("""
                        {"total": 2.25, "change": 0.75}
                        """));
    }

    @Test
    void refillingBeyondTheSlotCapacityIsRejected() throws Exception {
        mockMvc.perform(post("/api/machine/refill")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"items": [{"productId": 8, "quantity": 8}]}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SLOT_CAPACITY_EXCEEDED"));
    }

    @Test
    void unknownProductsAreNotFound() throws Exception {
        mockMvc.perform(post("/api/machine/purchase")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"items": [{"productId": 99, "quantity": 1}]}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("UNKNOWN_PRODUCT"));
    }

    @Test
    void returningCreditRefundsTheInsertedCoins() throws Exception {
        insertCredit("1.00");
        insertCredit("0.20");

        mockMvc.perform(post("/api/machine/credit/return"))
                .andExpect(status().isOk())
                .andExpect(content().json("""
                        {"returned": 1.20}
                        """));

        mockMvc.perform(get("/api/machine"))
                .andExpect(content().json("""
                        {"credit": 0.00}
                        """));
    }

    @Test
    void anEmptyCartIsRejected() throws Exception {
        insertCredit("2.00");

        mockMvc.perform(post("/api/machine/purchase")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"items": []}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    private void insertCredit(String amount) throws Exception {
        mockMvc.perform(post("/api/machine/credit")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\": " + amount + "}"))
                .andExpect(status().isOk());
    }
}
