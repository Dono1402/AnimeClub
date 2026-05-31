package com.example.AnimaClub.security;

import com.example.AnimaClub.services.AuthSessionService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class AccountAuthorizationInterceptorTests {

    private final AuthSessionService authSessionService = mock(AuthSessionService.class);
    private final AccountAuthorizationInterceptor interceptor = new AccountAuthorizationInterceptor(authSessionService);

    @Test
    void protectsPrivateAnimeLibraryRoute() {
        MockHttpServletRequest request = request("GET", "/animetheque/42");

        interceptor.preHandle(request, new MockHttpServletResponse(), new Object());

        verify(authSessionService).requireAccount(request, 42);
    }

    @Test
    void leavesPublicAnimeLibraryRouteOpen() {
        MockHttpServletRequest request = request("GET", "/animetheque/public/42");

        interceptor.preHandle(request, new MockHttpServletResponse(), new Object());

        verifyNoInteractions(authSessionService);
    }

    @Test
    void leavesPublicProfileImagesOpen() {
        MockHttpServletRequest request = request("GET", "/account/42/profile-picture");

        interceptor.preHandle(request, new MockHttpServletResponse(), new Object());

        verifyNoInteractions(authSessionService);
    }

    @Test
    void protectsProfileImageDeletion() {
        MockHttpServletRequest request = request("DELETE", "/account/42/profile-picture");

        interceptor.preHandle(request, new MockHttpServletResponse(), new Object());

        verify(authSessionService).requireAccount(request, 42);
    }

    @Test
    void leavesPublicProfileRouteOpen() {
        MockHttpServletRequest request = request("GET", "/account/public/demo");

        interceptor.preHandle(request, new MockHttpServletResponse(), new Object());

        verifyNoInteractions(authSessionService);
    }

    @Test
    void leavesPendingEmailChangeOpen() {
        MockHttpServletRequest request = request("POST", "/account/email-confirmation/change-address");

        interceptor.preHandle(request, new MockHttpServletResponse(), new Object());

        verifyNoInteractions(authSessionService);
    }

    private MockHttpServletRequest request(String method, String path) {
        return new MockHttpServletRequest(method, path);
    }
}
