import express from "express";
import cors from "cors";
import pool from "./datab.js";

const app = express();
app.use(cors());
app.use(express.json());

// 🛠️ Rota de Teste
app.get("/", (req, res) => {
    res.send("🚀 API rodando com PostgreSQL!");
});

app.get('/test', (req, res) => {
  res.send('API funcionando corretamente!');
});


// 🔹 Buscar Todos os Usuários
app.get("/users", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM users");
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔹 Criar Usuário (Cadastro)
app.post("/users", async (req, res) => {
    const { name, email, password, profile_image } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: "Todos os campos são obrigatórios" });
    }

    try {
        const result = await pool.query(
            "INSERT INTO users (name, email, password, profile_image) VALUES ($1, $2, $3, $4) RETURNING *",
            [name, email, password, profile_image || "/defaultProfile.png"]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔹 Login
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query(
            "SELECT * FROM users WHERE email = $1 AND password = $2",
            [email, password]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Email ou senha incorretos." });
        }

        const user = result.rows[0];



        res.status(200).json({
            message: "Login realizado com sucesso!",
            type: "success",
            data: user,
        });

    } catch (err) {
        console.error("❌ Erro no login:", err); // 👈 Coloque isso aqui
        res.status(500).json({ error: "Erro interno no servidor." });
    }
});


// 🔹 Buscar Usuário pelo ID
app.get("/users/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Usuário não encontrado" });
        }

        res.status(200).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔹 Criar Atividade
app.post("/activities", async (req, res) => {
    const { name, description, access_code, user_id, questions } = req.body;

    try {
        const activityResult = await pool.query(
            "INSERT INTO activities (name, description, access_code, user_id) VALUES ($1, $2, $3, $4) RETURNING *",
            [name, description, access_code, user_id]
        );

        if (activityResult.rows.length === 0) {
            return res.status(500).json({ error: "Erro ao criar atividade." });
        }

        const activity = activityResult.rows[0];

        // Adicionando as perguntas associadas
        if (questions && questions.length > 0) {
            for (const question of questions) {
                await pool.query(
                    "INSERT INTO questions (activity_id, text) VALUES ($1, $2)",
                    [activity.id, question.text]
                );
            }
        }

        console.log("✅ Atividade criada:", activity);
        res.status(201).json({ message: "Atividade criada!", activity });

    } catch (err) {
        console.error("❌ Erro ao criar atividade:", err);
        res.status(500).json({ error: "Erro ao criar atividade." });
    }
});

// 🔹 Atualizar atividade existente (Somente criador pode editar)
app.put("/activities/:id", async (req, res) => {
    const { id } = req.params;
    const { name, description, access_code, questions, user_id } = req.body;

    try {
        const activityCheck = await pool.query("SELECT user_id FROM activities WHERE id = $1", [id]);
        if (activityCheck.rows.length === 0) {
            return res.status(404).json({ error: "Atividade não encontrada." });
        }

        if (activityCheck.rows[0].user_id !== user_id) {
            return res.status(403).json({ error: "Você não tem permissão para editar esta atividade." });
        }

        const activityResult = await pool.query(
            "UPDATE activities SET name = $1, description = $2, access_code = $3 WHERE id = $4 RETURNING *",
            [name, description, access_code, id]
        );

        if (activityResult.rows.length === 0) {
            return res.status(500).json({ error: "Falha ao atualizar a atividade." });
        }

        const updatedActivity = activityResult.rows[0];

        await pool.query("DELETE FROM questions WHERE activity_id = $1", [id]);

        if (questions && questions.length > 0) {
            for (const question of questions) {
                await pool.query(
                    "INSERT INTO questions (activity_id, text) VALUES ($1, $2)",
                    [id, question.text]
                );
            }
        }

        res.status(200).json(updatedActivity);
    } catch (err) {
        console.error("Erro ao atualizar atividade:", err);
        res.status(500).json({ error: "Erro ao atualizar atividade." });
    }
});

// 🔥 Deletar uma Atividade (Apenas Criador Pode Deletar)
app.delete("/activities/:id", async (req, res) => {
    const { id } = req.params;
    const { user_id } = req.body; // ID do usuário que está tentando deletar

    try {
        // Verifica se a atividade existe e pertence ao usuário
        const activityCheck = await pool.query("SELECT * FROM activities WHERE id = $1", [id]);

        if (activityCheck.rows.length === 0) {
            return res.status(404).json({ error: "Atividade não encontrada." });
        }

        if (activityCheck.rows[0].user_id !== user_id) {
            return res.status(403).json({ error: "Você não tem permissão para excluir esta atividade." });
        }

        // Exclui as perguntas associadas primeiro
        await pool.query("DELETE FROM questions WHERE activity_id = $1", [id]);
        
        // Exclui a atividade
        await pool.query("DELETE FROM activities WHERE id = $1", [id]);

        console.log(`✅ Atividade ${id} deletada por usuário ${user_id}`);
        res.status(200).json({ message: "Atividade deletada com sucesso." });

    } catch (err) {
        console.error("❌ Erro ao deletar atividade:", err);
        res.status(500).json({ error: "Erro ao deletar atividade." });
    }
});

// 🔹 Buscar Todas Atividades do Usuário Logado
app.get("/activities", async (req, res) => {
    try {
        const { userId } = req.query;
        //console.log("🔍 Requisição de atividades para userId:", userId); // <- AQUI

        if (!userId) {
            return res.status(400).json({ error: "Usuário não autenticado." });
        }

        const query = `
            SELECT id, name, description, access_code, user_id, created_at 
            FROM activities 
            WHERE user_id = $1
            ORDER BY created_at DESC
        `;

        const result = await pool.query(query, [userId]);

        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// 🔹 Buscar atividade pelo ID (incluindo perguntas associadas)
app.get("/activities/id/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const activityResult = await pool.query("SELECT * FROM activities WHERE id = $1", [id]);

        if (activityResult.rows.length === 0) {
            return res.status(404).json({ error: "Atividade não encontrada." });
        }

        const activity = activityResult.rows[0];

        const questionsResult = await pool.query("SELECT * FROM questions WHERE activity_id = $1", [id]);
        activity.questions = questionsResult.rows;

        res.status(200).json(activity);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔹 Buscar atividade pelo código de acesso
app.get("/activities/access/:access_code", async (req, res) => {
    const { access_code } = req.params;

    try {
        const result = await pool.query("SELECT * FROM activities WHERE access_code = $1", [access_code]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Atividade não encontrada." });
        }

        res.status(200).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔹 Buscar todas as respostas associadas a uma atividade
app.get("/responses/activity/:activity_id", async (req, res) => {
    const { activity_id } = req.params;

    try {
        const responsesResult = await pool.query(
            `SELECT r.id, r.activity_id, r.user_id, COALESCE(u.name, 'Usuário Desconhecido') AS user_name, r.created_at AS date 
             FROM responses r 
             LEFT JOIN users u ON r.user_id = u.id 
             WHERE r.activity_id = $1`, 
            [activity_id]
        );

        if (responsesResult.rows.length === 0) {
            return res.status(200).json([]); // Retorna array vazio se não houver respostas
        }

        let responses = responsesResult.rows;

        // Buscar todas as respostas detalhadas para cada resposta enviada
        for (let response of responses) {
            const answersResult = await pool.query(
                `SELECT text FROM answers WHERE response_id = $1`,
                [response.id]
            );
            response.answers = answersResult.rows.map(a => a.text);
        }

        console.log("✅ Respostas encontradas para PDF:", responses);
        res.status(200).json(responses);

    } catch (err) {
        console.error("❌ Erro ao buscar respostas:", err);
        res.status(500).json({ error: "Erro ao buscar respostas." });
    }
});

// 🔹 Excluir atividade (somente o criador pode excluir)
app.delete("/activities/:id", async (req, res) => {
    const { id } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).json({ error: "ID do usuário é obrigatório." });
    }

    try {
        // Verifica se a atividade pertence ao usuário
        const checkResult = await pool.query(
            "SELECT user_id FROM activities WHERE id = $1",
            [id]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: "Atividade não encontrada." });
        }

        if (checkResult.rows[0].user_id !== user_id) {
            return res.status(403).json({ error: "Acesso negado. Você não pode excluir esta atividade." });
        }

        // Deleta a atividade e suas perguntas associadas
        await pool.query("DELETE FROM questions WHERE activity_id = $1", [id]);
        await pool.query("DELETE FROM activities WHERE id = $1", [id]);

        res.status(200).json({ message: "Atividade excluída com sucesso!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔹 Enviar Respostas
app.post("/responses", async (req, res) => {
    const { activityId, user, answers } = req.body;

    try {
        console.log("📤 Recebendo resposta:", req.body);

        if (!user || isNaN(user)) {
            return res.status(400).json({ error: "ID de usuário inválido." });
        }

        const userCheck = await pool.query("SELECT id FROM users WHERE id = $1", [user]);
        if (userCheck.rows.length === 0) {
            return res.status(400).json({ error: "Usuário não encontrado." });
        }

        const responseResult = await pool.query(
            "INSERT INTO responses (activity_id, user_id) VALUES ($1, $2) RETURNING id",
            [activityId, user]
        );

        const responseId = responseResult.rows[0].id;

        for (const answer of answers) {
            await pool.query(
                "INSERT INTO answers (response_id, text) VALUES ($1, $2)",
                [responseId, answer.text]
            );
        }

        console.log("✅ Respostas salvas com sucesso:", { responseId, user });
        res.status(201).json({ message: "Respostas enviadas!", responseId });

    } catch (err) {
        console.error("❌ Erro ao salvar respostas:", err);
        res.status(500).json({ error: "Erro ao salvar respostas." });
    }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
