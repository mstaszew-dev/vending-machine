package de.dm.vendingmachine.catalog;

/**
 * Product groups the machine is stocked with. The enum keeps the API strongly typed
 * while {@link #getLabel()} provides the human readable name used by the frontend.
 */
public enum ProductGroup {

    PERSONAL_HYGIENE("Personal hygiene"),
    FACE("Face"),
    PHOTO("Photo"),
    TEXTILE("Textile"),
    HOUSEHOLD("Household");

    private final String label;

    ProductGroup(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
