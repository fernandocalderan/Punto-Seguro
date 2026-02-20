(function adminLogin() {
  const form = document.getElementById("admin-login-form");
  const alertNode = document.getElementById("login-alert");

  function showAlert(message, isError) {
    if (!message) {
      alertNode.style.display = "none";
      alertNode.className = "notice";
      alertNode.textContent = "";
      return;
    }

    alertNode.style.display = "block";
    alertNode.className = isError ? "notice error" : "notice";
    alertNode.textContent = message;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showAlert("");

    const password = document.getElementById("password").value;
    if (!password) return;

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        throw new Error("Credenciales incorrectas");
      }

      window.location.href = "/admin/360";
    } catch (error) {
      showAlert(error.message, true);
    }
  });
})();
