
require("dotenv").config();

const express = require("express");
const path = require("path");
const supabase = require("./supabase");

const app = express();
const PORT = process.env.PORT || 3000;
const EVENTO_ID = Number(process.env.EVENTO_ID || 1);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// CONSULTAR EVENTO Y CANDIDATOS
app.get("/api/evento", async (req, res) => {
  try {
    const { data: evento, error: errorEvento } = await supabase
      .from("eventos")
      .select("id, nombre, estado")
      .eq("id", EVENTO_ID)
      .single();

    if (errorEvento) throw errorEvento;

    const { data: candidatos, error: errorCandidatos } =
      await supabase
        .from("candidatos")
        .select("id, nombre")
        .eq("evento_id", EVENTO_ID)
        .order("id");

    if (errorCandidatos) throw errorCandidatos;

    let yaVoto = false;
    const sessionId = req.query.sessionId;

    if (sessionId) {
      const { data, error } = await supabase
        .from("votos")
        .select("id")
        .eq("evento_id", EVENTO_ID)
        .eq("sesion_id", sessionId)
        .maybeSingle();

      if (error) throw error;
      yaVoto = Boolean(data);
    }

    res.json({ evento, candidatos, yaVoto });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Error al consultar evento" });
  }
});

// GENERAR SESION DE VOTANTE
app.post("/api/session", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("sesiones")
      .insert({ evento_id: EVENTO_ID })
      .select("id")
      .single();

    if (error) {
  console.error("ERROR DE SUPABASE:", error);

  return res.status(500).json({
    mensaje: "Error creando sesión",
    error: error.message,
    detalles: error.details,
    codigo: error.code
  });
}

    res.status(201).json({ sessionId: data.id });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "No se pudo crear la sesión" });
  }
});

// REGISTRAR VOTO
app.post("/api/votos", async (req, res) => {
  try {
    const { sessionId, candidateId } = req.body;

    if (
      typeof sessionId !== "string" ||
      !Number.isInteger(candidateId) ||
      candidateId <= 0
    ) {
      return res.status(400).json({ error: "Datos inválidos" });
    }

    // Comprobar que el evento esté abierto
    const { data: evento, error: errorEvento } = await supabase
      .from("eventos")
      .select("estado")
      .eq("id", EVENTO_ID)
      .single();

    if (errorEvento) throw errorEvento;

    if (evento.estado !== "abierta") {
      return res.status(403).json({
        error: "La votación no está abierta"
      });
    }

    // Comprobar que la sesión exista
    const { data: sesion, error: errorSesion } = await supabase
      .from("sesiones")
      .select("id")
      .eq("id", sessionId)
      .eq("evento_id", EVENTO_ID)
      .maybeSingle();

    if (errorSesion) throw errorSesion;

    if (!sesion) {
      return res.status(401).json({
        error: "Sesión inválida"
      });
    }

    // Comprobar que el candidato pertenezca al evento
    const { data: candidato, error: errorCandidato } =
      await supabase
        .from("candidatos")
        .select("id")
        .eq("id", candidateId)
        .eq("evento_id", EVENTO_ID)
        .maybeSingle();

    if (errorCandidato) throw errorCandidato;

    if (!candidato) {
      return res.status(400).json({
        error: "Candidato inválido"
      });
    }

    // Guardar voto: PostgreSQL bloquea duplicados
    const { error: errorVoto } = await supabase
      .from("votos")
      .insert({
        evento_id: EVENTO_ID,
        sesion_id: sessionId,
        candidato_id: candidateId
      });

    if (errorVoto) {
      if (errorVoto.code === "23505") {
        return res.status(409).json({
          error: "Esta sesión ya ha votado"
        });
      }

      throw errorVoto;
    }

    res.status(201).json({
      mensaje: "¡Voto registrado correctamente!"
    });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "No se pudo registrar el voto" });
  }
});


app.get("/api/resultados", async (req, res) => {
  try {
    // Obtener participantes
    const { data: candidatos, error } = await supabase
      .from("candidatos")
      .select("id, nombre")
      .eq("evento_id", EVENTO_ID);

    if (error) throw error;

    // Contar votos de cada participante
    const resultados = await Promise.all(
      candidatos.map(async (candidato) => {
        const { count, error } = await supabase
          .from("votos")
          .select("*", { count: "exact", head: true })
          .eq("evento_id", EVENTO_ID)
          .eq("candidato_id", candidato.id);

        if (error) throw error;

        return {
          id: candidato.id,
          participante: candidato.nombre,
          total_votos: count
        };
      })
    );

    const total = resultados.reduce(
      (suma, participante) => suma + participante.total_votos,
      0
    );

    res.json({
      resultados,
      total_general: total
    });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      error: "No se pudieron consultar los resultados"
    });
  }
});


app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});
