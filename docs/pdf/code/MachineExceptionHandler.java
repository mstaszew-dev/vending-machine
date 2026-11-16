package de.dm.vendingmachine.api;

import de.dm.vendingmachine.machine.MachineError;
import de.dm.vendingmachine.machine.MachineException;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Translates domain and validation failures into RFC 9457 problem responses. Clients get
 * a stable {@code code} property, so the frontend can distinguish "sold out" from
 * "not enough credit" without parsing prose.
 */
@RestControllerAdvice
public class MachineExceptionHandler {

    @ExceptionHandler(MachineException.class)
    public ProblemDetail handleMachineException(MachineException exception, HttpServletRequest request) {
        return problem(
                statusOf(exception.getCode()),
                exception.getCode().name(),
                exception.getMessage(),
                request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidationException(
            MethodArgumentNotValidException exception,
            HttpServletRequest request) {
        String detail = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + " " + error.getDefaultMessage())
                .collect(Collectors.joining(", "));
        return problem(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_ERROR",
                detail.isEmpty() ? "Request is not valid" : detail,
                request);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail handleUnreadableBody(
            HttpMessageNotReadableException exception,
            HttpServletRequest request) {
        return problem(
                HttpStatus.BAD_REQUEST,
                "INVALID_REQUEST",
                "Request body is missing or malformed",
                request);
    }

    private static HttpStatus statusOf(MachineError code) {
        return switch (code) {
            case UNKNOWN_PRODUCT -> HttpStatus.NOT_FOUND;
            case INSUFFICIENT_STOCK, INSUFFICIENT_CREDIT, SLOT_CAPACITY_EXCEEDED -> HttpStatus.CONFLICT;
            case INVALID_COIN, INVALID_QUANTITY -> HttpStatus.BAD_REQUEST;
        };
    }

    private static ProblemDetail problem(
            HttpStatus status,
            String code,
            String detail,
            HttpServletRequest request) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(status, detail);
        problemDetail.setTitle(status.getReasonPhrase());
        problemDetail.setInstance(URI.create(request.getRequestURI()));
        problemDetail.setProperty("code", code);
        return problemDetail;
    }
}
